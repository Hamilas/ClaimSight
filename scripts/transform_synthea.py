"""
Transform Synthea sample CSV export → ClaimSight input schema.

Synthea source:  https://github.com/synthetichealth/synthea-sample-data
Output schema:
  claims.csv:  claim_id, member_id, provider_id, service_date,
                 diagnosis_code, procedure_code, billed_amount, paid_amount, claim_status
  members.csv: member_id, full_name, date_of_birth, gender, city, state, plan_id
  providers.csv: provider_id, provider_name, specialty, npi, city, state

Usage:
  python scripts/transform_synthea.py \
      --zip /path/to/synthea_sample_data_csv_nov2021.zip \
      --out data/raw/ \
      --claims 5000
"""

from __future__ import annotations

import argparse
import hashlib
import io
import random
import zipfile
from pathlib import Path

import pandas as pd


# ── plan tier assignment ──────────────────────────────────────────────────────
PLAN_TIERS = ["PLAN_BRONZE", "PLAN_SILVER", "PLAN_GOLD", "PLAN_PLATINUM"]

# Deterministic plan from member_id hash so it's stable across runs
def _plan_from_id(member_id: str) -> str:
    h = int(hashlib.md5(member_id.encode()).hexdigest(), 16)
    return PLAN_TIERS[h % len(PLAN_TIERS)]


# ── NPI generation (10-digit, Luhn-valid style) ───────────────────────────────
def _npi_from_id(provider_id: str) -> str:
    h = int(hashlib.md5(provider_id.encode()).hexdigest(), 16)
    return str(h % 9_000_000_000 + 1_000_000_000)


# ── claim status derivation ───────────────────────────────────────────────────
def _claim_status(row: pd.Series) -> str:
    outstanding = float(row.get("OUTSTANDINGP", 0) or 0) + float(
        row.get("OUTSTANDING1", 0) or 0
    )
    status1 = str(row.get("STATUS1", "")).upper()
    if status1 == "OPEN":
        return "PENDING"
    if outstanding > 0.01:
        return "DENIED"
    return "PAID"


# ── main transform ────────────────────────────────────────────────────────────
def transform(zip_path: str, out_dir: str, n_claims: int = 5000) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    print(f"Reading Synthea archive: {zip_path}")
    with zipfile.ZipFile(zip_path) as zf:
        def read(name: str) -> pd.DataFrame:
            with zf.open(f"csv/{name}") as f:
                return pd.read_csv(f, low_memory=False)

        claims_raw   = read("claims.csv")
        txn_raw      = read("claims_transactions.csv")
        patients_raw = read("patients.csv")
        providers_raw = read("providers.csv")

    print(
        f"Loaded  claims={len(claims_raw):,}  transactions={len(txn_raw):,}  "
        f"patients={len(patients_raw):,}  providers={len(providers_raw):,}"
    )

    # ── 1. Build financial summary per claim from transactions ─────────────────
    charges  = txn_raw[txn_raw["TYPE"] == "CHARGE"].copy()
    payments = txn_raw[txn_raw["TYPE"] == "PAYMENT"].copy()

    charges["AMOUNT"]   = pd.to_numeric(charges["AMOUNT"],   errors="coerce").fillna(0)
    payments["PAYMENTS"] = pd.to_numeric(payments["PAYMENTS"], errors="coerce").fillna(0)

    billed = charges.groupby("CLAIMID")["AMOUNT"].sum().rename("billed_amount")
    paid   = payments.groupby("CLAIMID")["PAYMENTS"].sum().rename("paid_amount")

    # First procedure code per claim
    proc = (
        charges[charges["PROCEDURECODE"].notna()]
        .groupby("CLAIMID")["PROCEDURECODE"]
        .first()
        .rename("procedure_code")
    )

    financials = pd.concat([billed, paid, proc], axis=1).reset_index()
    financials.rename(columns={"CLAIMID": "Id"}, inplace=True)

    # ── 2. Merge claims + financials ──────────────────────────────────────────
    merged = claims_raw.merge(financials, on="Id", how="left")

    # Drop claims with no billed amount (administrative rows)
    merged = merged[merged["billed_amount"].fillna(0) > 0].copy()
    merged["paid_amount"] = merged["paid_amount"].fillna(0)

    # Sample n_claims
    if len(merged) > n_claims:
        merged = merged.sample(n=n_claims, random_state=42).reset_index(drop=True)

    print(f"Sampled {len(merged):,} claims after financial join")

    # ── 3. Build claims output ─────────────────────────────────────────────────
    claims_out = pd.DataFrame()
    claims_out["claim_id"]       = merged["Id"]
    claims_out["member_id"]      = merged["PATIENTID"]
    claims_out["provider_id"]    = merged["PROVIDERID"]
    claims_out["service_date"]   = pd.to_datetime(
        merged["SERVICEDATE"], errors="coerce"
    ).dt.strftime("%Y-%m-%d")
    claims_out["diagnosis_code"] = merged["DIAGNOSIS1"].fillna("Z00.00")
    claims_out["procedure_code"] = merged["procedure_code"].fillna("99213")
    claims_out["billed_amount"]  = merged["billed_amount"].round(2)
    claims_out["paid_amount"]    = merged["paid_amount"].round(2)
    # Assign realistic status distribution: 78% PAID, 14% DENIED, 8% PENDING
    # Use hash of claim_id for determinism
    def _status(claim_id: str) -> str:
        h = int(hashlib.md5(claim_id.encode()).hexdigest(), 16) % 100
        if h < 78:
            return "PAID"
        elif h < 92:
            return "DENIED"
        return "PENDING"

    claims_out["claim_status"] = merged["Id"].apply(_status)
    # DENIED claims should have paid_amount = 0
    claims_out.loc[claims_out["claim_status"] == "DENIED", "paid_amount"] = 0.0
    # Cap paid_amount at billed_amount, Synthea minimum payment floors can produce paid > billed
    claims_out["paid_amount"] = claims_out[["paid_amount", "billed_amount"]].min(axis=1)

    # ── 4. Build members output ───────────────────────────────────────────────
    member_ids = set(claims_out["member_id"].unique())
    pat = patients_raw[patients_raw["Id"].isin(member_ids)].copy()

    members_out = pd.DataFrame()
    members_out["member_id"]     = pat["Id"]
    members_out["full_name"]     = pat["FIRST"].fillna("") + " " + pat["LAST"].fillna("")
    members_out["full_name"]     = members_out["full_name"].str.strip()
    members_out["date_of_birth"] = pd.to_datetime(
        pat["BIRTHDATE"], errors="coerce"
    ).dt.strftime("%Y-%m-%d")
    members_out["gender"]        = pat["GENDER"].str.upper().map(
        {"M": "M", "F": "F"}
    ).fillna("U")
    members_out["city"]          = pat["CITY"].fillna("Unknown")
    # Diversify states, Synthea sample is MA-only, spread across 10 EU-analogous US states
    US_STATES = ["TX","CA","NY","FL","IL","PA","OH","GA","NC","WA","MA","AZ","CO","WI","MN"]
    def _state_from_id(mid: str) -> str:
        return US_STATES[int(hashlib.md5(mid.encode()).hexdigest(), 16) % len(US_STATES)]
    members_out["state"] = pat["Id"].apply(_state_from_id)
    members_out["plan_id"]       = pat["Id"].apply(_plan_from_id)

    # ── 5. Build providers output ─────────────────────────────────────────────
    provider_ids = set(claims_out["provider_id"].unique())
    prov = providers_raw[providers_raw["Id"].isin(provider_ids)].copy()

    providers_out = pd.DataFrame()
    providers_out["provider_id"]   = prov["Id"]
    providers_out["provider_name"] = prov["NAME"].fillna("Unknown Provider")
    providers_out["specialty"]     = (
        prov["SPECIALITY"]
        .fillna("GENERAL PRACTICE")
        .str.title()
        .str.strip()
    )
    providers_out["npi"]           = prov["Id"].apply(_npi_from_id)
    providers_out["city"]          = prov["CITY"].fillna("Unknown")
    providers_out["state"]         = prov["STATE"].str[:2].str.upper().fillna("XX")

    # ── 6. Write outputs ──────────────────────────────────────────────────────
    claims_path   = out / "claims_sample.csv"
    members_path  = out / "members_sample.csv"
    providers_path = out / "providers_sample.csv"

    claims_out.to_csv(claims_path,   index=False)
    members_out.to_csv(members_path,  index=False)
    providers_out.to_csv(providers_path, index=False)

    # ── 7. Summary ────────────────────────────────────────────────────────────
    print("\nTransformation complete")
    print(f"   claims.csv   → {len(claims_out):,} rows  ({claims_path})")
    print(f"   members.csv  → {len(members_out):,} rows  ({members_path})")
    print(f"   providers.csv → {len(providers_out):,} rows  ({providers_path})")
    print(f"\n   claim_status distribution:")
    print(claims_out["claim_status"].value_counts().to_string(header=False))
    print(f"\n   plan_id distribution:")
    print(members_out["plan_id"].value_counts().to_string(header=False))
    print(f"\n   billed_amount stats:")
    print(claims_out["billed_amount"].describe().round(2).to_string())

    # Validate schema columns match expected
    expected_claims   = {"claim_id","member_id","provider_id","service_date",
                         "diagnosis_code","procedure_code","billed_amount",
                         "paid_amount","claim_status"}
    expected_members  = {"member_id","full_name","date_of_birth","gender",
                         "city","state","plan_id"}
    expected_providers = {"provider_id","provider_name","specialty","npi",
                          "city","state"}

    assert set(claims_out.columns)   == expected_claims,   f"claims columns mismatch: {set(claims_out.columns)}"
    assert set(members_out.columns)  == expected_members,  f"members columns mismatch"
    assert set(providers_out.columns) == expected_providers, f"providers columns mismatch"
    print("\nSchema validation passed, all columns match pipeline expectations")


def main() -> None:
    parser = argparse.ArgumentParser(description="Transform Synthea CSV → ClaimSight schema")
    parser.add_argument("--zip", required=True, help="Path to Synthea CSV zip archive")
    parser.add_argument("--out", default="data/raw/", help="Output directory")
    parser.add_argument("--claims", type=int, default=5000, help="Number of claims to extract")
    args = parser.parse_args()
    transform(zip_path=args.zip, out_dir=args.out, n_claims=args.claims)


if __name__ == "__main__":
    main()

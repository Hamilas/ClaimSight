-- HealthFlow-Analytics — Fraud Detection Queries
-- Author: Rayen Lassoued | github.com/Hamilas
--
-- Three fraud patterns detected using SQL window functions:
--   1. Duplicate claims: same member + procedure within a 7-day rolling window
--   2. High-volume provider days: same provider with 10+ claims on a single day
--   3. Amount anomalies: billed amount exceeds 3 standard deviations from specialty mean
--
-- Input table: silver_member_claims (produced by silver layer)
-- Output: fraud_flags CTE — join back to claims for reporting

-- ─── Pattern 1: Duplicate claims within a 7-day window ────────────────────
-- A member submitting the same procedure code more than once within 7 days
-- is a strong indicator of a duplicate or fraudulent claim.

with duplicate_window as (
    select
        claim_id,
        member_id,
        procedure_code,
        service_date,
        claim_status,
        billed_amount,
        -- Count how many times this member had the same procedure in the
        -- 7 days prior (inclusive of current day)
        count(*) over (
            partition by member_id, procedure_code
            order by cast(service_date as timestamp)
            range between interval 6 days preceding and current row
        ) as claims_in_7d_window
    from silver_member_claims
    where claim_status != 'DENIED'
),

duplicate_flags as (
    select
        claim_id,
        member_id,
        procedure_code,
        service_date,
        billed_amount,
        claims_in_7d_window,
        'DUPLICATE_CLAIM_7D' as fraud_pattern,
        'high' as severity
    from duplicate_window
    where claims_in_7d_window > 1
),

-- ─── Pattern 2: High-volume provider days (same provider, 10+ claims/day) ──
-- A provider submitting an unusually high number of claims on a single day
-- may indicate billing fraud or upcoding.

provider_daily_volume as (
    select
        claim_id,
        provider_id,
        provider_name,
        provider_specialty,
        service_date,
        billed_amount,
        count(*) over (
            partition by provider_id, service_date
        ) as claims_on_day
    from silver_member_claims
),

provider_volume_flags as (
    select
        claim_id,
        provider_id,
        provider_name,
        provider_specialty,
        service_date,
        billed_amount,
        claims_on_day,
        'HIGH_VOLUME_PROVIDER_DAY' as fraud_pattern,
        case
            when claims_on_day >= 20 then 'critical'
            when claims_on_day >= 10 then 'high'
            else 'medium'
        end as severity
    from provider_daily_volume
    where claims_on_day >= 10
),

-- ─── Pattern 3: Billed amount exceeds 3 standard deviations from specialty mean
-- Statistical anomaly detection: claims billed far above the typical amount
-- for a given provider specialty flag potential upcoding or unbundling.

specialty_stats as (
    select
        provider_specialty,
        avg(billed_amount)                                       as specialty_avg,
        stddev_pop(billed_amount)                                as specialty_stddev,
        avg(billed_amount) + (3.0 * stddev_pop(billed_amount))  as threshold_3sigma
    from silver_member_claims
    where billed_amount > 0
    group by provider_specialty
),

amount_anomaly_flags as (
    select
        mc.claim_id,
        mc.provider_id,
        mc.provider_name,
        mc.provider_specialty,
        mc.service_date,
        mc.billed_amount,
        ss.specialty_avg,
        ss.threshold_3sigma,
        round((mc.billed_amount - ss.specialty_avg) / nullif(ss.specialty_stddev, 0), 2) as z_score,
        'AMOUNT_ANOMALY_3SIGMA' as fraud_pattern,
        case
            when mc.billed_amount >= ss.specialty_avg + (5.0 * ss.specialty_stddev) then 'critical'
            when mc.billed_amount >= ss.threshold_3sigma                             then 'high'
            else 'medium'
        end as severity
    from silver_member_claims mc
    inner join specialty_stats ss
        on mc.provider_specialty = ss.provider_specialty
    where mc.billed_amount >= ss.threshold_3sigma
),

-- ─── Combined fraud flags ────────────────────────────────────────────────────
fraud_flags as (
    select
        claim_id,
        null          as provider_id,
        null          as provider_name,
        null          as provider_specialty,
        member_id,
        service_date,
        billed_amount,
        fraud_pattern,
        severity,
        current_timestamp() as flagged_at
    from duplicate_flags

    union all

    select
        claim_id,
        provider_id,
        provider_name,
        provider_specialty,
        null          as member_id,
        service_date,
        billed_amount,
        fraud_pattern,
        severity,
        current_timestamp() as flagged_at
    from provider_volume_flags

    union all

    select
        claim_id,
        provider_id,
        provider_name,
        provider_specialty,
        null          as member_id,
        service_date,
        billed_amount,
        fraud_pattern,
        severity,
        current_timestamp() as flagged_at
    from amount_anomaly_flags
)

-- ─── Final output: fraud summary by pattern ─────────────────────────────────
select
    fraud_pattern,
    severity,
    count(*)                            as flagged_claims,
    count(distinct claim_id)            as distinct_claims,
    round(sum(billed_amount), 2)        as total_billed_at_risk,
    round(avg(billed_amount), 2)        as avg_billed_per_flag,
    min(service_date)                   as earliest_flag_date,
    max(service_date)                   as latest_flag_date
from fraud_flags
group by fraud_pattern, severity
order by
    case severity
        when 'critical' then 1
        when 'high'     then 2
        when 'medium'   then 3
        else 4
    end,
    flagged_claims desc;

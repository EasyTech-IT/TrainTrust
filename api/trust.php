<?php
declare(strict_types=1);

// Pure trust rules (PRD section 8). Starting values, to be tuned with real data.
const TT_CONFIRM_MIN_SUPPORTERS = 3;
const TT_CONFIRM_WINDOW_SEC = 240;
const TT_MAX_ROUTE_DISTANCE_KM = 3.0;
const TT_MAX_SPEED_KMH = 300.0;

function haversine_km(float $lat1, float $lon1, float $lat2, float $lon2): float
{
    $r = 6371.0;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
    return 2 * $r * asin(min(1.0, sqrt($a)));
}

// Distance from a point to a segment, using a local flat projection (fine for short segments).
function point_segment_km(float $lat, float $lon, array $a, array $b): float
{
    $kx = 111.32 * cos(deg2rad($lat));
    $ky = 110.57;
    $px = ($lon - $a['lon']) * $kx;
    $py = ($lat - $a['lat']) * $ky;
    $dx = ($b['lon'] - $a['lon']) * $kx;
    $dy = ($b['lat'] - $a['lat']) * $ky;
    $len2 = $dx * $dx + $dy * $dy;
    $t = $len2 > 0 ? max(0.0, min(1.0, ($px * $dx + $py * $dy) / $len2)) : 0.0;
    return hypot($px - $t * $dx, $py - $t * $dy);
}

// $stops: list of ['lat'=>, 'lon'=>] in route order.
function route_distance_km(float $lat, float $lon, array $stops): float
{
    if (count($stops) === 0) {
        return INF;
    }
    if (count($stops) === 1) {
        return haversine_km($lat, $lon, $stops[0]['lat'], $stops[0]['lon']);
    }
    $best = INF;
    for ($i = 0; $i < count($stops) - 1; $i++) {
        $best = min($best, point_segment_km($lat, $lon, $stops[$i], $stops[$i + 1]));
    }
    return $best;
}

// $previous: ['lat','lon','t'] or null.
function location_plausible(float $lat, float $lon, array $stops, ?array $previous, int $now): bool
{
    if (route_distance_km($lat, $lon, $stops) > TT_MAX_ROUTE_DISTANCE_KM) {
        return false;
    }
    if ($previous !== null) {
        $dt = max(1, $now - $previous['t']);
        $km = haversine_km($lat, $lon, $previous['lat'], $previous['lon']);
        if ($km / ($dt / 3600) > TT_MAX_SPEED_KMH && $km > 1.0) {
            return false;
        }
    }
    return true;
}

function trust_weight(float $score): float
{
    return max(0.2, min(2.0, $score));
}

/**
 * $report:   ['created_at'=>int,'user_id'=>int,'locked'=>int,'status'=>string]
 * $supports: list of ['user_id','created_at','location_ok','trust'] (same-type reports of other users + confirm votes)
 * $disputes: list of ['user_id','created_at','trust']
 * Returns 'unconfirmed' | 'confirmed' | 'disputed'.
 */
function evaluate_report(array $report, bool $reporterLocationOk, float $reporterTrust, array $supports, array $disputes): string
{
    $window = TT_CONFIRM_WINDOW_SEC;
    $weights = [];
    if ($reporterLocationOk) {
        $weights[$report['user_id']] = trust_weight($reporterTrust);
    }
    foreach ($supports as $s) {
        if (!$s['location_ok'] || $s['user_id'] === $report['user_id']) {
            continue;
        }
        if ($s['created_at'] - $report['created_at'] > $window) {
            continue;
        }
        $weights[$s['user_id']] = max($weights[$s['user_id']] ?? 0, trust_weight($s['trust']));
    }
    $supportWeight = array_sum($weights);
    $disputeUsers = [];
    foreach ($disputes as $d) {
        $disputeUsers[$d['user_id']] = trust_weight($d['trust']);
    }
    $disputeWeight = array_sum($disputeUsers);

    if (count($weights) >= TT_CONFIRM_MIN_SUPPORTERS && $supportWeight >= TT_CONFIRM_MIN_SUPPORTERS && $supportWeight > $disputeWeight) {
        return 'confirmed';
    }
    if (count($disputeUsers) >= 2 && $disputeWeight > $supportWeight) {
        return 'disputed';
    }
    return 'unconfirmed';
}

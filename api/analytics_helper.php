<?php

function logAnalyticsEvent(
    $pdo,
    $userId,
    $eventType,
    $stationId = null,
    $fromStationId = null,
    $toStationId = null,
    $tripId = null,
    $metadata = null
) {
    $metadataJson = null;

    if ($metadata !== null) {
        $metadataJson = json_encode($metadata, JSON_UNESCAPED_UNICODE);
    }

    $stmt = $pdo->prepare("
        INSERT INTO analytics_events (
            user_id,
            event_type,
            station_id,
            from_station_id,
            to_station_id,
            trip_id,
            metadata,
            ip_address,
            user_agent,
            created_at
        ) VALUES (
            :user_id,
            :event_type,
            :station_id,
            :from_station_id,
            :to_station_id,
            :trip_id,
            :metadata,
            :ip_address,
            :user_agent,
            NOW()
        )
    ");

    $stmt->execute([
        ':user_id' => $userId,
        ':event_type' => $eventType,
        ':station_id' => $stationId,
        ':from_station_id' => $fromStationId,
        ':to_station_id' => $toStationId,
        ':trip_id' => $tripId,
        ':metadata' => $metadataJson,
        ':ip_address' => $_SERVER['REMOTE_ADDR'] ?? null,
        ':user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null
    ]);
}
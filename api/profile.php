<?php

require_once 'db.php';

header('Content-Type: application/json; charset=utf-8');

function response($statusCode, $success, $message, $data = [])
{
    http_response_code($statusCode);

    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

function getInput()
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!is_array($input)) {
        $input = $_POST;
    }

    return $input;
}

function getToken($input)
{
    return trim($input['token'] ?? '');
}

function authUser($pdo, $input)
{
    $token = getToken($input);

    if (!$token) {
        response(401, false, 'Token göndərilməyib');
    }

    $tokenHash = hash('sha256', $token);

    $stmt = $pdo->prepare("
        SELECT
            u.id,
            u.full_name,
            u.phone,
            u.status,
            u.deleted_at,
            t.id AS token_id,
            t.expires_at,
            t.revoked_at
        FROM user_tokens t
        INNER JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = :token_hash
        LIMIT 1
    ");

    $stmt->execute([
        ':token_hash' => $tokenHash
    ]);

    $user = $stmt->fetch();

    if (!$user) {
        response(401, false, 'Token yanlışdır');
    }

    if ($user['revoked_at'] !== null) {
        response(401, false, 'Token deaktiv edilib');
    }

    if (strtotime($user['expires_at']) < time()) {
        response(401, false, 'Tokenin vaxtı bitib');
    }

    if ($user['deleted_at'] !== null || $user['status'] !== 'active') {
        response(403, false, 'Hesab aktiv deyil');
    }

    return $user;
}

function boolValue($value)
{
    return $value === true || $value === 1 || $value === '1' || $value === 'true';
}

function ensureProfileSettings($pdo, $userId)
{
    $stmt = $pdo->prepare("
        SELECT *
        FROM user_profile_settings
        WHERE user_id = :user_id
        LIMIT 1
    ");

    $stmt->execute([
        ':user_id' => $userId
    ]);

    $settings = $stmt->fetch();

    if ($settings) {
        return $settings;
    }

    $insertStmt = $pdo->prepare("
        INSERT INTO user_profile_settings (
            user_id,
            language,
            appearance,
            notifications_enabled,
            accessibility_enabled
        ) VALUES (
            :user_id,
            'az',
            'system',
            1,
            0
        )
    ");

    $insertStmt->execute([
        ':user_id' => $userId
    ]);

    $stmt->execute([
        ':user_id' => $userId
    ]);

    return $stmt->fetch();
}

function getStationById($pdo, $stationId)
{
    $stmt = $pdo->prepare("
        SELECT
            id,
            name,
            line_name,
            is_active
        FROM stations
        WHERE id = :id
          AND is_active = 1
        LIMIT 1
    ");

    $stmt->execute([
        ':id' => $stationId
    ]);

    return $stmt->fetch();
}

function getProfileData($pdo, $user)
{
    $userId = (int) $user['id'];

    $settings = ensureProfileSettings($pdo, $userId);

    $favoriteStationStmt = $pdo->prepare("
        SELECT
            s.id,
            s.name,
            s.line_name
        FROM user_favorite_stations fs
        INNER JOIN stations s ON s.id = fs.station_id
        WHERE fs.user_id = :user_id
        LIMIT 1
    ");

    $favoriteStationStmt->execute([
        ':user_id' => $userId
    ]);

    $favoriteStation = $favoriteStationStmt->fetch();

    $routesCountStmt = $pdo->prepare("
        SELECT COUNT(*) AS total
        FROM user_favorite_routes
        WHERE user_id = :user_id
    ");

    $routesCountStmt->execute([
        ':user_id' => $userId
    ]);

    $routesCount = $routesCountStmt->fetch();

    $paymentCountStmt = $pdo->prepare("
        SELECT COUNT(*) AS total
        FROM user_payment_methods
        WHERE user_id = :user_id
          AND is_active = 1
    ");

    $paymentCountStmt->execute([
        ':user_id' => $userId
    ]);

    $paymentCount = $paymentCountStmt->fetch();

    $tripCountStmt = $pdo->prepare("
        SELECT COUNT(*) AS total
        FROM user_trip_sessions
        WHERE user_id = :user_id
    ");

    $tripCountStmt->execute([
        ':user_id' => $userId
    ]);

    $tripCount = $tripCountStmt->fetch();

    return [
        'user' => [
            'id' => $userId,
            'full_name' => $user['full_name'],
            'phone' => $user['phone'],
            'initials' => mb_strtoupper(mb_substr(trim($user['full_name']), 0, 1))
        ],
        'favorite_station' => $favoriteStation ? [
            'id' => (int) $favoriteStation['id'],
            'name' => $favoriteStation['name'],
            'line_name' => $favoriteStation['line_name']
        ] : null,
        'notifications' => [
            'enabled' => (bool) $settings['notifications_enabled'],
            'status_text' => (int) $settings['notifications_enabled'] === 1 ? 'Aktiv' : 'Deaktiv'
        ],
        'settings' => [
            'language' => $settings['language'],
            'appearance' => $settings['appearance'],
            'notifications_enabled' => (bool) $settings['notifications_enabled'],
            'accessibility_enabled' => (bool) $settings['accessibility_enabled']
        ],
        'summary' => [
            'favorite_routes_count' => (int) $routesCount['total'],
            'payment_methods_count' => (int) $paymentCount['total'],
            'trip_history_count' => (int) $tripCount['total']
        ],
        'menu' => [
            'today' => [
                [
                    'key' => 'personal_info',
                    'title' => 'Şəxsi məlumatlarım',
                    'enabled' => true
                ],
                [
                    'key' => 'payment_methods',
                    'title' => 'Ödəniş metodlarım',
                    'enabled' => true
                ],
                [
                    'key' => 'trip_history',
                    'title' => 'Səfər tarixçəm',
                    'enabled' => true
                ],
                [
                    'key' => 'favorite_routes',
                    'title' => 'Seçilmiş marşrutlarım',
                    'enabled' => true
                ]
            ],
            'settings' => [
                [
                    'key' => 'language',
                    'title' => 'Dil',
                    'value' => $settings['language']
                ],
                [
                    'key' => 'security',
                    'title' => 'Təhlükəsizlik',
                    'enabled' => true
                ],
                [
                    'key' => 'accessibility',
                    'title' => 'Əlçatanlıq',
                    'enabled' => (bool) $settings['accessibility_enabled']
                ],
                [
                    'key' => 'appearance',
                    'title' => 'Görünüş',
                    'value' => $settings['appearance']
                ],
                [
                    'key' => 'notification_settings',
                    'title' => 'Bildiriş tənzimləmələri',
                    'enabled' => (bool) $settings['notifications_enabled']
                ],
                [
                    'key' => 'support',
                    'title' => 'Dəstək',
                    'enabled' => true
                ]
            ]
        ]
    ];
}

function listFavoriteRoutes($pdo, $userId)
{
    $stmt = $pdo->prepare("
        SELECT
            fr.id,
            fr.title,
            fr.from_station_id,
            fr.to_station_id,
            fs.name AS from_station_name,
            fs.line_name AS from_line_name,
            ts.name AS to_station_name,
            ts.line_name AS to_line_name,
            fr.created_at
        FROM user_favorite_routes fr
        INNER JOIN stations fs ON fs.id = fr.from_station_id
        INNER JOIN stations ts ON ts.id = fr.to_station_id
        WHERE fr.user_id = :user_id
        ORDER BY fr.id DESC
    ");

    $stmt->execute([
        ':user_id' => $userId
    ]);

    $rows = $stmt->fetchAll();

    $routes = [];

    foreach ($rows as $row) {
        $routes[] = [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'from_station' => [
                'id' => (int) $row['from_station_id'],
                'name' => $row['from_station_name'],
                'line_name' => $row['from_line_name']
            ],
            'to_station' => [
                'id' => (int) $row['to_station_id'],
                'name' => $row['to_station_name'],
                'line_name' => $row['to_line_name']
            ],
            'created_at' => $row['created_at']
        ];
    }

    return $routes;
}

function listPaymentMethods($pdo, $userId)
{
    $stmt = $pdo->prepare("
        SELECT
            id,
            provider,
            card_brand,
            card_last4,
            holder_name,
            is_default,
            created_at
        FROM user_payment_methods
        WHERE user_id = :user_id
          AND is_active = 1
        ORDER BY is_default DESC, id DESC
    ");

    $stmt->execute([
        ':user_id' => $userId
    ]);

    $rows = $stmt->fetchAll();

    $methods = [];

    foreach ($rows as $row) {
        $methods[] = [
            'id' => (int) $row['id'],
            'provider' => $row['provider'],
            'card_brand' => $row['card_brand'],
            'card_last4' => $row['card_last4'],
            'display_text' => $row['card_brand'] . ' •••• ' . $row['card_last4'],
            'holder_name' => $row['holder_name'],
            'is_default' => (bool) $row['is_default'],
            'created_at' => $row['created_at']
        ];
    }

    return $methods;
}

function listTripHistory($pdo, $userId)
{
    $stmt = $pdo->prepare("
        SELECT
            ts.id,
            ts.from_station_id,
            ts.to_station_id,
            ts.current_station_id,
            ts.active_step_order,
            ts.status,
            ts.route_snapshot,
            ts.started_at,
            ts.updated_at,
            ts.completed_at,
            ts.cancelled_at,

            fs.name AS from_station_name,
            fs.line_name AS from_line_name,

            tos.name AS to_station_name,
            tos.line_name AS to_line_name,

            cs.name AS current_station_name,
            cs.line_name AS current_line_name
        FROM user_trip_sessions ts
        INNER JOIN stations fs ON fs.id = ts.from_station_id
        INNER JOIN stations tos ON tos.id = ts.to_station_id
        LEFT JOIN stations cs ON cs.id = ts.current_station_id
        WHERE ts.user_id = :user_id
        ORDER BY ts.id DESC
        LIMIT 30
    ");

    $stmt->execute([
        ':user_id' => $userId
    ]);

    $rows = $stmt->fetchAll();

    $history = [];

    foreach ($rows as $row) {
        if ($row['status'] === 'completed') {
            $statusText = 'Tamamlandı';
        } elseif ($row['status'] === 'cancelled') {
            $statusText = 'Ləğv edildi';
        } else {
            $statusText = 'Aktiv';
        }

        $history[] = [
            'id' => (int) $row['id'],
            'from_station' => [
                'id' => (int) $row['from_station_id'],
                'name' => $row['from_station_name'],
                'line_name' => $row['from_line_name']
            ],
            'to_station' => [
                'id' => (int) $row['to_station_id'],
                'name' => $row['to_station_name'],
                'line_name' => $row['to_line_name']
            ],
            'current_station' => $row['current_station_id'] !== null ? [
                'id' => (int) $row['current_station_id'],
                'name' => $row['current_station_name'],
                'line_name' => $row['current_line_name']
            ] : null,
            'active_step_order' => (int) $row['active_step_order'],
            'status' => $row['status'],
            'status_text' => $statusText,
            'route_snapshot' => $row['route_snapshot'] ? json_decode($row['route_snapshot'], true) : null,
            'started_at' => $row['started_at'],
            'updated_at' => $row['updated_at'],
            'completed_at' => $row['completed_at'],
            'cancelled_at' => $row['cancelled_at']
        ];
    }

    return $history;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    response(405, false, 'Bu endpoint yalnız POST metodu qəbul edir');
}

$input = getInput();

$action = trim($input['action'] ?? '');

if ($action === '') {
    response(400, false, 'Action göndərilməlidir');
}

$allowedActions = [
    'get_profile',
    'update_profile',
    'update_settings',
    'set_favorite_station',
    'list_favorite_routes',
    'add_favorite_route',
    'remove_favorite_route',
    'list_payment_methods',
    'list_trip_history',
    'delete_account'
];

if (!in_array($action, $allowedActions, true)) {
    response(400, false, 'Action düzgün deyil');
}

try {
    $pdo = db();

    $user = authUser($pdo, $input);
    $userId = (int) $user['id'];

    if ($action === 'get_profile') {
        response(200, true, 'Profil məlumatları uğurla gətirildi', [
            'profile' => getProfileData($pdo, $user)
        ]);
    }

    if ($action === 'update_profile') {
        $fullName = trim($input['full_name'] ?? '');

        if ($fullName === '') {
            response(400, false, 'Tam ad boş ola bilməz');
        }

        if (mb_strlen($fullName) < 3) {
            response(400, false, 'Tam ad minimum 3 simvol olmalıdır');
        }

        if (mb_strlen($fullName) > 120) {
            response(400, false, 'Tam ad maksimum 120 simvol ola bilər');
        }

        $stmt = $pdo->prepare("
            UPDATE users
            SET
                full_name = :full_name,
                updated_at = NOW()
            WHERE id = :id
        ");

        $stmt->execute([
            ':full_name' => $fullName,
            ':id' => $userId
        ]);

        $user['full_name'] = $fullName;

        response(200, true, 'Profil məlumatları yeniləndi', [
            'profile' => getProfileData($pdo, $user)
        ]);
    }

    if ($action === 'update_settings') {
        $language = trim($input['language'] ?? 'az');
        $appearance = trim($input['appearance'] ?? 'system');

        $notificationsEnabled = array_key_exists('notifications_enabled', $input)
            ? boolValue($input['notifications_enabled'])
            : true;

        $accessibilityEnabled = array_key_exists('accessibility_enabled', $input)
            ? boolValue($input['accessibility_enabled'])
            : false;

        $allowedLanguages = ['az', 'en', 'ru'];
        $allowedAppearance = ['light', 'dark', 'system'];

        if (!in_array($language, $allowedLanguages, true)) {
            response(400, false, 'Dil düzgün deyil. az, en və ya ru olmalıdır');
        }

        if (!in_array($appearance, $allowedAppearance, true)) {
            response(400, false, 'Görünüş düzgün deyil. light, dark və ya system olmalıdır');
        }

        $stmt = $pdo->prepare("
            INSERT INTO user_profile_settings (
                user_id,
                language,
                appearance,
                notifications_enabled,
                accessibility_enabled
            ) VALUES (
                :user_id,
                :language,
                :appearance,
                :notifications_enabled,
                :accessibility_enabled
            )
            ON DUPLICATE KEY UPDATE
                language = VALUES(language),
                appearance = VALUES(appearance),
                notifications_enabled = VALUES(notifications_enabled),
                accessibility_enabled = VALUES(accessibility_enabled),
                updated_at = NOW()
        ");

        $stmt->execute([
            ':user_id' => $userId,
            ':language' => $language,
            ':appearance' => $appearance,
            ':notifications_enabled' => $notificationsEnabled ? 1 : 0,
            ':accessibility_enabled' => $accessibilityEnabled ? 1 : 0
        ]);

        response(200, true, 'Tənzimləmələr yeniləndi', [
            'profile' => getProfileData($pdo, $user)
        ]);
    }

    if ($action === 'set_favorite_station') {
        $stationId = (int) ($input['station_id'] ?? 0);

        if ($stationId <= 0) {
            response(400, false, 'Stansiya ID düzgün göndərilməyib');
        }

        $station = getStationById($pdo, $stationId);

        if (!$station) {
            response(404, false, 'Stansiya tapılmadı');
        }

        $stmt = $pdo->prepare("
            INSERT INTO user_favorite_stations (
                user_id,
                station_id
            ) VALUES (
                :user_id,
                :station_id
            )
            ON DUPLICATE KEY UPDATE
                station_id = VALUES(station_id),
                updated_at = NOW()
        ");

        $stmt->execute([
            ':user_id' => $userId,
            ':station_id' => $stationId
        ]);

        response(200, true, 'Seçilmiş stansiya yeniləndi', [
            'favorite_station' => [
                'id' => (int) $station['id'],
                'name' => $station['name'],
                'line_name' => $station['line_name']
            ]
        ]);
    }

    if ($action === 'list_favorite_routes') {
        response(200, true, 'Seçilmiş marşrutlar uğurla gətirildi', [
            'routes' => listFavoriteRoutes($pdo, $userId)
        ]);
    }

    if ($action === 'add_favorite_route') {
        $fromStationId = (int) ($input['from_station_id'] ?? 0);
        $toStationId = (int) ($input['to_station_id'] ?? 0);
        $title = trim($input['title'] ?? '');

        if ($fromStationId <= 0) {
            response(400, false, 'Başlanğıc stansiya düzgün göndərilməyib');
        }

        if ($toStationId <= 0) {
            response(400, false, 'Gediləcək stansiya düzgün göndərilməyib');
        }

        if ($fromStationId === $toStationId) {
            response(400, false, 'Başlanğıc və gediləcək stansiya eyni ola bilməz');
        }

        $fromStation = getStationById($pdo, $fromStationId);
        $toStation = getStationById($pdo, $toStationId);

        if (!$fromStation) {
            response(404, false, 'Başlanğıc stansiya tapılmadı');
        }

        if (!$toStation) {
            response(404, false, 'Gediləcək stansiya tapılmadı');
        }

        if ($title === '') {
            $title = $fromStation['name'] . ' → ' . $toStation['name'];
        }

        $stmt = $pdo->prepare("
            INSERT INTO user_favorite_routes (
                user_id,
                from_station_id,
                to_station_id,
                title
            ) VALUES (
                :user_id,
                :from_station_id,
                :to_station_id,
                :title
            )
            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                updated_at = NOW()
        ");

        $stmt->execute([
            ':user_id' => $userId,
            ':from_station_id' => $fromStationId,
            ':to_station_id' => $toStationId,
            ':title' => $title
        ]);

        response(201, true, 'Marşrut seçilmişlərə əlavə edildi', [
            'routes' => listFavoriteRoutes($pdo, $userId)
        ]);
    }

    if ($action === 'remove_favorite_route') {
        $routeId = (int) ($input['route_id'] ?? 0);

        if ($routeId <= 0) {
            response(400, false, 'Marşrut ID düzgün göndərilməyib');
        }

        $stmt = $pdo->prepare("
            DELETE FROM user_favorite_routes
            WHERE id = :id
              AND user_id = :user_id
        ");

        $stmt->execute([
            ':id' => $routeId,
            ':user_id' => $userId
        ]);

        response(200, true, 'Marşrut seçilmişlərdən silindi', [
            'routes' => listFavoriteRoutes($pdo, $userId)
        ]);
    }

    if ($action === 'list_payment_methods') {
        response(200, true, 'Ödəniş metodları uğurla gətirildi', [
            'payment_methods' => listPaymentMethods($pdo, $userId)
        ]);
    }

    if ($action === 'list_trip_history') {
        response(200, true, 'Səfər tarixçəsi uğurla gətirildi', [
            'trips' => listTripHistory($pdo, $userId)
        ]);
    }

    if ($action === 'delete_account') {
        $confirm = $input['confirm'] ?? false;

        if (!boolValue($confirm)) {
            response(400, false, 'Hesabı silmək üçün confirm true göndərilməlidir');
        }

        $pdo->beginTransaction();

        $deleteUserStmt = $pdo->prepare("
            UPDATE users
            SET
                status = 'deleted',
                deleted_at = NOW(),
                updated_at = NOW()
            WHERE id = :id
        ");

        $deleteUserStmt->execute([
            ':id' => $userId
        ]);

        $revokeTokensStmt = $pdo->prepare("
            UPDATE user_tokens
            SET revoked_at = NOW()
            WHERE user_id = :user_id
              AND revoked_at IS NULL
        ");

        $revokeTokensStmt->execute([
            ':user_id' => $userId
        ]);

        $pdo->commit();

        response(200, true, 'Hesab uğurla deaktiv edildi', [
            'deleted' => true
        ]);
    }

} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    response(500, false, 'Server xətası baş verdi', [
        'error' => $e->getMessage()
    ]);

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    response(500, false, 'Gözlənilməz xəta baş verdi', [
        'error' => $e->getMessage()
    ]);
}
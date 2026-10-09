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
    if (!empty($input['token'])) {
        return trim($input['token']);
    }

    $headers = function_exists('getallheaders') ? getallheaders() : [];

    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';

    if (!$authHeader && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    }

    if (!$authHeader && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }

    if (preg_match('/Bearer\s+(.+)/i', $authHeader, $matches)) {
        return trim($matches[1]);
    }

    return null;
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
            t.id AS token_id,
            t.expires_at,
            t.revoked_at,
            u.id,
            u.full_name,
            u.phone,
            u.status,
            u.deleted_at
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
        response(401, false, 'Token artıq deaktiv edilib');
    }

    if (strtotime($user['expires_at']) < time()) {
        response(401, false, 'Tokenin vaxtı bitib');
    }

    if ($user['deleted_at'] !== null || $user['status'] !== 'active') {
        response(403, false, 'Bu hesab aktiv deyil');
    }

    return $user;
}

function parseBooleanValue($value)
{
    if ($value === true || $value === 1 || $value === '1' || $value === 'true') {
        return 1;
    }

    if ($value === false || $value === 0 || $value === '0' || $value === 'false') {
        return 0;
    }

    return null;
}

function prepareMetadataForDb($metadata)
{
    if ($metadata === null || $metadata === '') {
        return null;
    }

    if (is_array($metadata)) {
        return json_encode($metadata, JSON_UNESCAPED_UNICODE);
    }

    if (is_string($metadata)) {
        json_decode($metadata, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            response(400, false, 'Metadata düzgün JSON formatında deyil');
        }

        return $metadata;
    }

    response(400, false, 'Metadata array və ya JSON string olmalıdır');
}

function getNotificationTypeConfig($type, $metadata = [])
{
    $uiType = $metadata['ui_type'] ?? $type;

    $configs = [
        'route_info' => [
            'title' => 'Marşrut məlumatı',
            'icon_key' => 'train',
            'color_key' => 'green'
        ],
        'reminder' => [
            'title' => 'Xatırlatma',
            'icon_key' => 'bell',
            'color_key' => 'blue'
        ],
        'trip_completed' => [
            'title' => 'Marşrut başa çatdı',
            'icon_key' => 'check',
            'color_key' => 'green'
        ],
        'alert' => [
            'title' => 'Diqqət',
            'icon_key' => 'warning',
            'color_key' => 'yellow'
        ],
        'campaign' => [
            'title' => 'Kampaniya',
            'icon_key' => 'megaphone',
            'color_key' => 'purple'
        ],
        'system' => [
            'title' => 'Sistem bildirişi',
            'icon_key' => 'info',
            'color_key' => 'blue'
        ],
        'transaction' => [
            'title' => 'Ödəniş bildirişi',
            'icon_key' => 'card',
            'color_key' => 'blue'
        ],
        'promo' => [
            'title' => 'Kampaniya',
            'icon_key' => 'megaphone',
            'color_key' => 'purple'
        ]
    ];

    return $configs[$uiType] ?? $configs['system'];
}

function getDateGroup($createdAt)
{
    $date = date('Y-m-d', strtotime($createdAt));
    $today = date('Y-m-d');
    $yesterday = date('Y-m-d', strtotime('-1 day'));

    if ($date === $today) {
        return [
            'key' => 'today',
            'title' => 'Bu gün'
        ];
    }

    if ($date === $yesterday) {
        return [
            'key' => 'yesterday',
            'title' => 'Dünən'
        ];
    }

    return [
        'key' => 'older',
        'title' => 'Əvvəl'
    ];
}

function getTimeText($createdAt)
{
    $date = date('Y-m-d', strtotime($createdAt));
    $today = date('Y-m-d');
    $yesterday = date('Y-m-d', strtotime('-1 day'));

    if ($date === $today) {
        return date('H:i', strtotime($createdAt));
    }

    if ($date === $yesterday) {
        return 'Dünən, ' . date('H:i', strtotime($createdAt));
    }

    return date('d M H:i', strtotime($createdAt));
}

function formatNotification($row)
{
    $metadata = $row['metadata'] ? json_decode($row['metadata'], true) : null;

    if (!is_array($metadata)) {
        $metadata = [];
    }

    $typeConfig = getNotificationTypeConfig($row['type'], $metadata);
    $dateGroup = getDateGroup($row['created_at']);

    return [
        'id' => (int) $row['id'],
        'title' => $metadata['display_title'] ?? $row['title'],
        'description' => $row['description'],
        'type' => $row['type'],
        'ui_type' => $metadata['ui_type'] ?? $row['type'],
        'category_title' => $typeConfig['title'],
        'icon_key' => $metadata['icon_key'] ?? $typeConfig['icon_key'],
        'color_key' => $metadata['color_key'] ?? $typeConfig['color_key'],
        'is_read' => (bool) $row['is_read'],
        'is_unread' => !(bool) $row['is_read'],
        'read_at' => $row['read_at'],
        'metadata' => $metadata,
        'group_key' => $dateGroup['key'],
        'group_title' => $dateGroup['title'],
        'time_text' => getTimeText($row['created_at']),
        'created_at' => $row['created_at'],
        'updated_at' => $row['updated_at']
    ];
}

function groupNotificationsByDate($notifications)
{
    $groupsMap = [
        'today' => [
            'key' => 'today',
            'title' => 'Bu gün',
            'notifications' => []
        ],
        'yesterday' => [
            'key' => 'yesterday',
            'title' => 'Dünən',
            'notifications' => []
        ],
        'older' => [
            'key' => 'older',
            'title' => 'Əvvəl',
            'notifications' => []
        ]
    ];

    foreach ($notifications as $notification) {
        $groupKey = $notification['group_key'];

        if (!isset($groupsMap[$groupKey])) {
            $groupKey = 'older';
        }

        $groupsMap[$groupKey]['notifications'][] = $notification;
    }

    $groups = [];

    foreach ($groupsMap as $group) {
        if (count($group['notifications']) > 0) {
            $groups[] = $group;
        }
    }

    return $groups;
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
    'create',
    'list',
    'get',
    'update',
    'delete',
    'mark_read',
    'mark_all_read',
    'unread_count'
];

if (!in_array($action, $allowedActions, true)) {
    response(400, false, 'Action düzgün deyil');
}

try {
    $pdo = db();
    $user = authUser($pdo, $input);
    $userId = (int) $user['id'];

    if ($action === 'create') {
        $title = trim($input['title'] ?? '');
        $description = trim($input['description'] ?? '');
        $type = trim($input['type'] ?? 'system');
        $metadata = $input['metadata'] ?? null;

        $allowedTypes = ['system', 'transaction', 'promo'];

        if ($title === '') {
            response(400, false, 'Bildiriş başlığı boş ola bilməz');
        }

        if (mb_strlen($title) > 150) {
            response(400, false, 'Bildiriş başlığı maksimum 150 simvol ola bilər');
        }

        if ($description === '') {
            response(400, false, 'Bildiriş mətni boş ola bilməz');
        }

        if (!in_array($type, $allowedTypes, true)) {
            response(400, false, 'Bildiriş tipi düzgün deyil');
        }

        $metadataJson = prepareMetadataForDb($metadata);

        $stmt = $pdo->prepare("
            INSERT INTO notifications (
                user_id,
                title,
                description,
                type,
                metadata,
                created_at,
                updated_at
            ) VALUES (
                :user_id,
                :title,
                :description,
                :type,
                :metadata,
                NOW(),
                NOW()
            )
        ");

        $stmt->execute([
            ':user_id' => $userId,
            ':title' => $title,
            ':description' => $description,
            ':type' => $type,
            ':metadata' => $metadataJson
        ]);

        $notificationId = $pdo->lastInsertId();

        $selectStmt = $pdo->prepare("
            SELECT *
            FROM notifications
            WHERE id = :id
              AND user_id = :user_id
            LIMIT 1
        ");

        $selectStmt->execute([
            ':id' => $notificationId,
            ':user_id' => $userId
        ]);

        $notification = $selectStmt->fetch();

        response(201, true, 'Bildiriş uğurla yaradıldı', [
            'notification' => formatNotification($notification)
        ]);
    }

    if ($action === 'list') {
        $limit = isset($input['limit']) ? (int) $input['limit'] : 50;
        $offset = isset($input['offset']) ? (int) $input['offset'] : 0;
        $tab = trim($input['tab'] ?? 'all');

        if ($limit < 1) $limit = 50;
        if ($limit > 100) $limit = 100;
        if ($offset < 0) $offset = 0;

        $allowedTabs = ['all', 'unread', 'system'];

        if (!in_array($tab, $allowedTabs, true)) {
            response(400, false, 'Tab düzgün deyil. all, unread və ya system olmalıdır');
        }

        $where = "WHERE user_id = :user_id";
        $params = [':user_id' => $userId];

        if ($tab === 'unread') {
            $where .= " AND is_read = 0";
        }

        if ($tab === 'system') {
            $where .= " AND type = 'system'";
        }

        if (array_key_exists('is_read', $input)) {
            $isRead = parseBooleanValue($input['is_read']);

            if ($isRead === null) {
                response(400, false, 'is_read dəyəri düzgün deyil');
            }

            $where .= " AND is_read = :is_read";
            $params[':is_read'] = $isRead;
        }

        if (array_key_exists('type', $input) && trim($input['type']) !== '') {
            $type = trim($input['type']);
            $allowedTypes = ['system', 'transaction', 'promo'];

            if (!in_array($type, $allowedTypes, true)) {
                response(400, false, 'Bildiriş tipi düzgün deyil');
            }

            $where .= " AND type = :type";
            $params[':type'] = $type;
        }

        $countsStmt = $pdo->prepare("
            SELECT
                COUNT(*) AS all_count,
                SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread_count,
                SUM(CASE WHEN type = 'system' THEN 1 ELSE 0 END) AS system_count
            FROM notifications
            WHERE user_id = :user_id
        ");

        $countsStmt->execute([
            ':user_id' => $userId
        ]);

        $counts = $countsStmt->fetch();

        $countStmt = $pdo->prepare("
            SELECT COUNT(*) AS total_count
            FROM notifications
            $where
        ");

        $countStmt->execute($params);
        $totalCount = (int) $countStmt->fetch()['total_count'];

        $stmt = $pdo->prepare("
            SELECT *
            FROM notifications
            $where
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        ");

        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }

        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $notifications = array_map('formatNotification', $stmt->fetchAll());

        response(200, true, 'Bildirişlər uğurla gətirildi', [
            'active_tab' => $tab,
            'tabs' => [
                [
                    'key' => 'all',
                    'title' => 'Hamısı',
                    'count' => (int) $counts['all_count']
                ],
                [
                    'key' => 'unread',
                    'title' => 'Oxunmamış',
                    'count' => (int) $counts['unread_count']
                ],
                [
                    'key' => 'system',
                    'title' => 'Sistem',
                    'count' => (int) $counts['system_count']
                ]
            ],
            'unread_count' => (int) $counts['unread_count'],
            'total_count' => $totalCount,
            'limit' => $limit,
            'offset' => $offset,
            'notifications' => $notifications,
            'groups' => groupNotificationsByDate($notifications)
        ]);
    }

    if ($action === 'get') {
        $id = (int) ($input['id'] ?? 0);

        if ($id <= 0) {
            response(400, false, 'Bildiriş ID düzgün deyil');
        }

        $stmt = $pdo->prepare("
            SELECT *
            FROM notifications
            WHERE id = :id
              AND user_id = :user_id
            LIMIT 1
        ");

        $stmt->execute([
            ':id' => $id,
            ':user_id' => $userId
        ]);

        $notification = $stmt->fetch();

        if (!$notification) {
            response(404, false, 'Bildiriş tapılmadı');
        }

        response(200, true, 'Bildiriş uğurla gətirildi', [
            'notification' => formatNotification($notification)
        ]);
    }

    if ($action === 'update') {
        $id = (int) ($input['id'] ?? 0);
        $title = trim($input['title'] ?? '');
        $description = trim($input['description'] ?? '');
        $type = trim($input['type'] ?? 'system');
        $metadata = $input['metadata'] ?? null;

        $allowedTypes = ['system', 'transaction', 'promo'];

        if ($id <= 0) {
            response(400, false, 'Bildiriş ID düzgün deyil');
        }

        if ($title === '') {
            response(400, false, 'Bildiriş başlığı boş ola bilməz');
        }

        if ($description === '') {
            response(400, false, 'Bildiriş mətni boş ola bilməz');
        }

        if (!in_array($type, $allowedTypes, true)) {
            response(400, false, 'Bildiriş tipi düzgün deyil');
        }

        $metadataJson = prepareMetadataForDb($metadata);

        $stmt = $pdo->prepare("
            UPDATE notifications
            SET
                title = :title,
                description = :description,
                type = :type,
                metadata = :metadata,
                updated_at = NOW()
            WHERE id = :id
              AND user_id = :user_id
        ");

        $stmt->execute([
            ':title' => $title,
            ':description' => $description,
            ':type' => $type,
            ':metadata' => $metadataJson,
            ':id' => $id,
            ':user_id' => $userId
        ]);

        if ($stmt->rowCount() === 0) {
            response(404, false, 'Bildiriş tapılmadı və ya dəyişiklik edilmədi');
        }

        $selectStmt = $pdo->prepare("
            SELECT *
            FROM notifications
            WHERE id = :id
              AND user_id = :user_id
            LIMIT 1
        ");

        $selectStmt->execute([
            ':id' => $id,
            ':user_id' => $userId
        ]);

        response(200, true, 'Bildiriş uğurla yeniləndi', [
            'notification' => formatNotification($selectStmt->fetch())
        ]);
    }

    if ($action === 'mark_read') {
        $id = (int) ($input['id'] ?? 0);

        if ($id <= 0) {
            response(400, false, 'Bildiriş ID düzgün deyil');
        }

        $stmt = $pdo->prepare("
            UPDATE notifications
            SET 
                is_read = 1,
                read_at = IF(read_at IS NULL, NOW(), read_at),
                updated_at = NOW()
            WHERE id = :id
              AND user_id = :user_id
        ");

        $stmt->execute([
            ':id' => $id,
            ':user_id' => $userId
        ]);

        if ($stmt->rowCount() === 0) {
            response(404, false, 'Bildiriş tapılmadı və ya artıq oxunmuşdur');
        }

        response(200, true, 'Bildiriş oxunmuş kimi işarələndi');
    }

    if ($action === 'mark_all_read') {
        $stmt = $pdo->prepare("
            UPDATE notifications
            SET 
                is_read = 1,
                read_at = IF(read_at IS NULL, NOW(), read_at),
                updated_at = NOW()
            WHERE user_id = :user_id
              AND is_read = 0
        ");

        $stmt->execute([
            ':user_id' => $userId
        ]);

        response(200, true, 'Bütün bildirişlər oxunmuş kimi işarələndi', [
            'updated_count' => $stmt->rowCount()
        ]);
    }

    if ($action === 'unread_count') {
        $stmt = $pdo->prepare("
            SELECT COUNT(*) AS unread_count
            FROM notifications
            WHERE user_id = :user_id
              AND is_read = 0
        ");

        $stmt->execute([
            ':user_id' => $userId
        ]);

        $result = $stmt->fetch();

        response(200, true, 'Oxunmamış bildiriş sayı uğurla gətirildi', [
            'unread_count' => (int) $result['unread_count']
        ]);
    }

    if ($action === 'delete') {
        $id = (int) ($input['id'] ?? 0);

        if ($id <= 0) {
            response(400, false, 'Bildiriş ID düzgün deyil');
        }

        $stmt = $pdo->prepare("
            DELETE FROM notifications
            WHERE id = :id
              AND user_id = :user_id
        ");

        $stmt->execute([
            ':id' => $id,
            ':user_id' => $userId
        ]);

        if ($stmt->rowCount() === 0) {
            response(404, false, 'Bildiriş tapılmadı');
        }

        response(200, true, 'Bildiriş uğurla silindi');
    }

} catch (PDOException $e) {
    response(500, false, 'Server xətası baş verdi', [
        'error' => $e->getMessage()
    ]);
} catch (Exception $e) {
    response(500, false, 'Gözlənilməz xəta baş verdi', [
        'error' => $e->getMessage()
    ]);
}
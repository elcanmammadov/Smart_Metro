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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    response(405, false, 'Bu endpoint yalnız POST metodu qəbul edir');
}

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input)) {
    $input = $_POST;
}

$fullName = trim($input['full_name'] ?? '');
$phone = trim($input['phone'] ?? '');
$password = $input['password'] ?? '';
$termsAccepted = $input['terms_accepted'] ?? false;

if ($fullName === '') {
    response(400, false, 'Tam ad boş ola bilməz');
}

if (mb_strlen($fullName) < 3) {
    response(400, false, 'Tam ad minimum 3 simvol olmalıdır');
}

if (mb_strlen($fullName) > 120) {
    response(400, false, 'Tam ad maksimum 120 simvol ola bilər');
}

if ($phone === '') {
    response(400, false, 'Telefon nömrəsi boş ola bilməz');
}

if (!preg_match('/^\+?[0-9]{9,15}$/', $phone)) {
    response(400, false, 'Telefon nömrəsi düzgün formatda deyil');
}

if ($password === '') {
    response(400, false, 'Şifrə boş ola bilməz');
}

if (strlen($password) < 8) {
    response(400, false, 'Şifrə minimum 8 simvol olmalıdır');
}

if ($termsAccepted !== true && $termsAccepted !== 'true' && $termsAccepted !== '1' && $termsAccepted !== 1) {
    response(400, false, 'İstifadə şərtləri qəbul edilməlidir');
}

try {
    $pdo = db();

    $checkStmt = $pdo->prepare("
        SELECT id 
        FROM users 
        WHERE phone = :phone 
        LIMIT 1
    ");

    $checkStmt->execute([
        ':phone' => $phone
    ]);

    $existingUser = $checkStmt->fetch();

    if ($existingUser) {
        response(409, false, 'Bu telefon nömrəsi ilə artıq hesab mövcuddur');
    }

    $pdo->beginTransaction();

    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    $insertUserStmt = $pdo->prepare("
        INSERT INTO users (
            full_name,
            phone,
            password_hash,
            terms_accepted,
            terms_accepted_at,
            status,
            created_at,
            updated_at
        ) VALUES (
            :full_name,
            :phone,
            :password_hash,
            1,
            NOW(),
            'active',
            NOW(),
            NOW()
        )
    ");

    $insertUserStmt->execute([
        ':full_name' => $fullName,
        ':phone' => $phone,
        ':password_hash' => $passwordHash
    ]);

    $userId = $pdo->lastInsertId();

    $plainToken = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $plainToken);

    $insertTokenStmt = $pdo->prepare("
        INSERT INTO user_tokens (
            user_id,
            token_hash,
            device_name,
            ip_address,
            user_agent,
            expires_at,
            created_at
        ) VALUES (
            :user_id,
            :token_hash,
            :device_name,
            :ip_address,
            :user_agent,
            DATE_ADD(NOW(), INTERVAL 30 DAY),
            NOW()
        )
    ");

    $insertTokenStmt->execute([
        ':user_id' => $userId,
        ':token_hash' => $tokenHash,
        ':device_name' => $input['device_name'] ?? null,
        ':ip_address' => $_SERVER['REMOTE_ADDR'] ?? null,
        ':user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null
    ]);

    $pdo->commit();

    response(201, true, 'Qeydiyyat uğurla tamamlandı', [
        'user' => [
            'id' => (int) $userId,
            'full_name' => $fullName,
            'phone' => $phone
        ],
        'token' => $plainToken,
        'token_type' => 'Bearer',
        'expires_in_days' => 30
    ]);

} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    response(500, false, 'Server xətası baş verdi. Zəhmət olmasa yenidən cəhd edin');

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    response(500, false, 'Gözlənilməz xəta baş verdi');
}
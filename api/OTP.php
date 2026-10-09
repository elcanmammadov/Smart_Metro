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

$phone = trim($input['phone'] ?? '');
$otp = trim($input['otp'] ?? '');

$phone = preg_replace('/[\s\-\(\)]/', '', $phone);

if ($phone === '') {
    response(400, false, 'Telefon nömrəsi boş ola bilməz');
}

if (!preg_match('/^\+?[0-9]{9,15}$/', $phone)) {
    response(400, false, 'Telefon nömrəsi düzgün formatda deyil');
}

if ($otp === '') {
    response(400, false, 'OTP kodu boş ola bilməz');
}

if (!preg_match('/^[0-9]{4}$/', $otp)) {
    response(400, false, 'OTP kodu 4 rəqəmli olmalıdır');
}

try {
    $pdo = db();

    $userStmt = $pdo->prepare("
        SELECT 
            id,
            full_name,
            phone,
            status,
            deleted_at
        FROM users
        WHERE phone = :phone
        LIMIT 1
    ");

    $userStmt->execute([
        ':phone' => $phone
    ]);

    $user = $userStmt->fetch();

    if (!$user) {
        response(404, false, 'Bu telefon nömrəsi ilə istifadəçi tapılmadı');
    }

    if ($user['deleted_at'] !== null || $user['status'] === 'deleted') {
        response(403, false, 'Bu hesab artıq aktiv deyil');
    }

    if ($user['status'] === 'blocked') {
        response(403, false, 'Bu hesab bloklanıb');
    }

    if ($user['status'] !== 'active') {
        response(403, false, 'Bu hesab aktiv deyil');
    }

    $codeStmt = $pdo->prepare("
        SELECT 
            id,
            code_hash,
            attempts,
            expires_at,
            verified_at
        FROM phone_verification_codes
        WHERE phone = :phone
          AND purpose = 'reset_password'
          AND verified_at IS NULL
        ORDER BY id DESC
        LIMIT 1
    ");

    $codeStmt->execute([
        ':phone' => $phone
    ]);

    $otpCode = $codeStmt->fetch();

    if (!$otpCode) {
        response(400, false, 'Aktiv OTP kodu tapılmadı');
    }

    if ((int) $otpCode['attempts'] >= 5) {
        response(429, false, 'Çox sayda yanlış cəhd edildi. Yeni OTP kodu tələb edin');
    }

    if (strtotime($otpCode['expires_at']) < time()) {
        response(410, false, 'OTP kodunun vaxtı bitib. Yeni OTP kodu tələb edin');
    }

    if (!password_verify($otp, $otpCode['code_hash'])) {
        $attemptStmt = $pdo->prepare("
            UPDATE phone_verification_codes
            SET attempts = attempts + 1
            WHERE id = :id
        ");

        $attemptStmt->execute([
            ':id' => $otpCode['id']
        ]);

        response(401, false, 'OTP kodu yanlışdır');
    }

    $pdo->beginTransaction();

    $verifyOtpStmt = $pdo->prepare("
        UPDATE phone_verification_codes
        SET verified_at = NOW()
        WHERE id = :id
    ");

    $verifyOtpStmt->execute([
        ':id' => $otpCode['id']
    ]);

    $revokeOldResetTokensStmt = $pdo->prepare("
        UPDATE user_tokens
        SET revoked_at = NOW()
        WHERE user_id = :user_id
          AND token_type = 'password_reset'
          AND revoked_at IS NULL
    ");

    $revokeOldResetTokensStmt->execute([
        ':user_id' => $user['id']
    ]);

    $plainToken = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $plainToken);

    $insertTokenStmt = $pdo->prepare("
        INSERT INTO user_tokens (
            user_id,
            token_hash,
            token_type,
            device_name,
            ip_address,
            user_agent,
            expires_at,
            created_at
        ) VALUES (
            :user_id,
            :token_hash,
            'password_reset',
            :device_name,
            :ip_address,
            :user_agent,
            DATE_ADD(NOW(), INTERVAL 15 MINUTE),
            NOW()
        )
    ");

    $insertTokenStmt->execute([
        ':user_id' => $user['id'],
        ':token_hash' => $tokenHash,
        ':device_name' => $input['device_name'] ?? null,
        ':ip_address' => $_SERVER['REMOTE_ADDR'] ?? null,
        ':user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null
    ]);

    $pdo->commit();

    response(200, true, 'OTP kodu uğurla təsdiqləndi', [
        'user' => [
            'id' => (int) $user['id'],
            'full_name' => $user['full_name'],
            'phone' => $user['phone']
        ],
        'token' => $plainToken,
        'token_type' => 'password_reset',
        'expires_in_minutes' => 15
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
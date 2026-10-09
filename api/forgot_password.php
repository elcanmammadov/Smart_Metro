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

function sendOtpEmail($phone, $code)
{
    $to = "avazalijamal@gmail.com";
    $subject = "Password reset OTP code";

    $message = "Salam,\n\n";
    $message .= "Şifrə yeniləmə üçün OTP kodu:\n\n";
    $message .= $code . "\n\n";
    $message .= "Telefon nömrəsi: " . $phone . "\n";
    $message .= "Kod 10 dəqiqə ərzində keçərlidir.\n\n";
    $message .= "Əgər bu sorğunu siz etməmisinizsə, bu emailə məhəl qoymayın.";

    $headers = "From: no-reply@yourdomain.com\r\n";
    $headers .= "Reply-To: no-reply@yourdomain.com\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

    return mail($to, $subject, $message, $headers);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    response(405, false, 'Bu endpoint yalnız POST metodu qəbul edir');
}

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input)) {
    $input = $_POST;
}

$action = trim($input['action'] ?? '');
$phone = trim($input['phone'] ?? '');

$phone = preg_replace('/[\s\-\(\)]/', '', $phone);

if ($action === '') {
    response(400, false, 'Action göndərilməlidir');
}

if (!in_array($action, ['request_code', 'reset_password'], true)) {
    response(400, false, 'Action düzgün deyil. request_code və ya reset_password olmalıdır');
}

if ($phone === '') {
    response(400, false, 'Telefon nömrəsi boş ola bilməz');
}

if (!preg_match('/^\+?[0-9]{9,15}$/', $phone)) {
    response(400, false, 'Telefon nömrəsi düzgün formatda deyil');
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

    if ($action === 'request_code') {
        $code = (string) random_int(1000, 9999);
        $codeHash = password_hash($code, PASSWORD_DEFAULT);

        $pdo->beginTransaction();

        $expireOldCodesStmt = $pdo->prepare("
            UPDATE phone_verification_codes
            SET verified_at = NOW()
            WHERE phone = :phone
              AND purpose = 'reset_password'
              AND verified_at IS NULL
        ");

        $expireOldCodesStmt->execute([
            ':phone' => $phone
        ]);

        $insertCodeStmt = $pdo->prepare("
            INSERT INTO phone_verification_codes (
                phone,
                code_hash,
                purpose,
                expires_at,
                attempts,
                created_at
            ) VALUES (
                :phone,
                :code_hash,
                'reset_password',
                DATE_ADD(NOW(), INTERVAL 10 MINUTE),
                0,
                NOW()
            )
        ");

        $insertCodeStmt->execute([
            ':phone' => $phone,
            ':code_hash' => $codeHash
        ]);

        $emailSent = sendOtpEmail($phone, $code);

        if (!$emailSent) {
            $pdo->rollBack();
            response(500, false, 'OTP kodu email vasitəsilə göndərilə bilmədi');
        }

        $pdo->commit();

        response(200, true, 'Şifrə yeniləmə kodu emailə göndərildi', [
            'phone' => $phone,
            'expires_in_minutes' => 10
        ]);
    }

    if ($action === 'reset_password') {
        $code = trim($input['code'] ?? '');
        $newPassword = $input['new_password'] ?? '';

        if ($code === '') {
            response(400, false, 'Təsdiq kodu boş ola bilməz');
        }

        if (!preg_match('/^[0-9]{4}$/', $code)) {
            response(400, false, 'Təsdiq kodu 4 rəqəmli olmalıdır');
        }

        if ($newPassword === '') {
            response(400, false, 'Yeni şifrə boş ola bilməz');
        }

        if (strlen($newPassword) < 8) {
            response(400, false, 'Yeni şifrə minimum 8 simvol olmalıdır');
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

        $resetCode = $codeStmt->fetch();

        if (!$resetCode) {
            response(400, false, 'Aktiv təsdiq kodu tapılmadı');
        }

        if ((int) $resetCode['attempts'] >= 5) {
            response(429, false, 'Çox sayda yanlış cəhd edildi. Yeni kod tələb edin');
        }

        if (strtotime($resetCode['expires_at']) < time()) {
            response(410, false, 'Təsdiq kodunun vaxtı bitib. Yeni kod tələb edin');
        }

        if (!password_verify($code, $resetCode['code_hash'])) {
            $attemptStmt = $pdo->prepare("
                UPDATE phone_verification_codes
                SET attempts = attempts + 1
                WHERE id = :id
            ");

            $attemptStmt->execute([
                ':id' => $resetCode['id']
            ]);

            response(401, false, 'Təsdiq kodu yanlışdır');
        }

        $pdo->beginTransaction();

        $newPasswordHash = password_hash($newPassword, PASSWORD_DEFAULT);

        $updatePasswordStmt = $pdo->prepare("
            UPDATE users
            SET 
                password_hash = :password_hash,
                updated_at = NOW()
            WHERE id = :id
        ");

        $updatePasswordStmt->execute([
            ':password_hash' => $newPasswordHash,
            ':id' => $user['id']
        ]);

        $verifyCodeStmt = $pdo->prepare("
            UPDATE phone_verification_codes
            SET verified_at = NOW()
            WHERE id = :id
        ");

        $verifyCodeStmt->execute([
            ':id' => $resetCode['id']
        ]);

        $revokeTokensStmt = $pdo->prepare("
            UPDATE user_tokens
            SET revoked_at = NOW()
            WHERE user_id = :user_id
              AND revoked_at IS NULL
        ");

        $revokeTokensStmt->execute([
            ':user_id' => $user['id']
        ]);

        $pdo->commit();

        response(200, true, 'Şifrə uğurla yeniləndi. Zəhmət olmasa yenidən giriş edin', [
            'user' => [
                'id' => (int) $user['id'],
                'full_name' => $user['full_name'],
                'phone' => $user['phone']
            ]
        ]);
    }

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
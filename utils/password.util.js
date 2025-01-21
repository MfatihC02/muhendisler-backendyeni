export const validatePassword = (password) => {
    // En az 8 karakter
    if (password.length < 8) return false;

    // En az bir büyük harf
    if (!/[A-Z]/.test(password)) return false;

    // En az bir küçük harf
    if (!/[a-z]/.test(password)) return false;

    // En az bir rakam
    if (!/[0-9]/.test(password)) return false;

    // En az bir özel karakter
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return false;

    return true;
}; 
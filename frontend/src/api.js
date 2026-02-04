export async function getSurvey(token) {
    const response = await fetch("/api/GetSurvey?t=" + token);
    return await response.json();
}

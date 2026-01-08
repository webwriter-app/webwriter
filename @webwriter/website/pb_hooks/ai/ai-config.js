// Azure OpenAI Konfiguration
const endpoint = "webwriterai.openai.azure.com";
const apiKey = "*******************************************************************";
const apiVersion = "2024-05-01-preview";
const deployment = "gpt-4.1"; 


// Funktion zum Aufrufen der Azure OpenAI API mit PocketBase $http
function callAzureOpenAI(requestData) {

    const url = `https://${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

    try {
        const res = $http.send({
            url: url,
            method: "POST",
            body: JSON.stringify(requestData),
            headers: {
                "Content-Type": "application/json",
                "api-key": apiKey
            },
            timeout: 120 // 120 Sekunden Timeout
        });

        // Prüfen des Statuscodes der Antwort
        if (res.statusCode !== 200) {
            throw new Error(`HTTP Error: ${res.statusCode} - ${res.body}`);
        }

        // Prüfen ob res.body existiert und nicht leer ist
        if (!res.body) {
            throw new Error('Leere Antwort von der API erhalten');
        }

        // Versuchen JSON zu parsen falls res.json undefined ist
        let result;
        if (res.json) {
            result = res.json;
        } else {
            try {
                result = JSON.parse(res.body);
            } catch (parseError) {
                throw new Error(`Fehler beim Parsen der JSON-Antwort: ${parseError.message}. Body: ${res.body}`);
            }
        }

        // Validierung der Antwortstruktur
        if (!result) {
            throw new Error('Ungültige JSON-Antwort erhalten');
        }

        if (!result.choices || !Array.isArray(result.choices) || result.choices.length === 0) {
            throw new Error(`Keine choices in der API-Antwort gefunden. Antwort: ${JSON.stringify(result)}`);
        }

        if (!result.choices[0].message) {
            throw new Error(`Keine message im ersten choice gefunden. Choice: ${JSON.stringify(result.choices[0])}`);
        }

        return result.choices[0].message;
    } catch (error) {
        console.error("Fehler beim Azure OpenAI API Aufruf:", error);
        throw error;
    }
}

module.exports = {
    callAzureOpenAI
}
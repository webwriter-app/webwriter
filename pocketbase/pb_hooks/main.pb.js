// PocketBase API Route für Chat
routerAdd("POST", "/api/chat", (e) => {
    const record = e.auth;

    if (!record) {
        return e.json(401, { "error": "Für diese Aktion ist eine Authentifizierung erforderlich." });
    }

    const { callAzureOpenAI } = require(`${__hooks}/ai-config.js`);

    try {
        // Request Body lesen
        const requestBody = JSON.parse(toString(e.request.body));


        const requestData = {
            model: "gpt-4.1",
            max_tokens: 1000,
            ...requestBody // Zusätzliche Parameter aus dem Request Body übernehmen
        }

        // Validierung der eingehenden Daten
        if (!requestBody.messages || !Array.isArray(requestBody.messages)) {
            return e.json(400, {
                "error": "Ungültiger Request: 'messages' Array erforderlich"
            });
        }

        // Chat-Historie kopieren
        let chatHistory = [...requestBody.messages];


        // AI-Antwort abrufen
        const aiResponse = callAzureOpenAI(requestData);


        // AI-Antwort zur Chat-Historie hinzufügen
        chatHistory.push(aiResponse);

        // Erweiterte Chat-Historie zurückgeben
        return e.json(200, {
            "success": true,
            "messages": chatHistory,
            "lastMessage": aiResponse
        });

    } catch (error) {
        console.error("Fehler beim Verarbeiten der Chat-Anfrage:", error, typeof error, error.message);
        return e.json(500, {
            "error": "Interner Serverfehler beim Verarbeiten der Chat-Anfrage",
            "details": error.message
        });
    }
});

// Test-Route für einfache Nachrichten
routerAdd("GET", "/hello/{name}", (e) => {
    let name = e.request.pathValue("name");
    return e.json(200, { "message": "Hallo " + name });
});

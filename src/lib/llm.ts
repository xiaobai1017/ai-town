
export async function generateResponse(model: string, prompt: string): Promise<string> {
    try {
        await logToServer(`LLM Request [${model}]: ${prompt}`);

        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                prompt: prompt,
                stream: false
            }),
        });

        if (!response.ok) {
            const errorMsg = `LLM API Error: ${response.status} ${response.statusText}`;
            console.error(errorMsg);
            await logToServer(errorMsg);
            return "I cannot think right now.";
        }

        const data = await response.json();
        const result = data.response.trim();

        await logToServer(`LLM Response: ${result}`);

        if (!result) return "...";

        return result;
    } catch (error) {
        console.error('LLM Fetch Error:', error);
        await logToServer(`LLM Fetch Error: ${String(error)}`);
        return "Hello there!";
    }
}

async function logToServer(message: string) {
    try {
        await fetch('/api/log', {
            method: 'POST',
            body: JSON.stringify({ message }),
        });
    } catch (e) {
        // ignore log error
    }
}

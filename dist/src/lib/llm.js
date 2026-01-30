import { LLM_ENDPOINT, LLM_API_KEY } from './config';
export async function generateResponse(model, prompt) {
    try {
        await logToServer(`LLM Request [${model}]: ${prompt}`);
        const response = await fetch(LLM_ENDPOINT, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, (LLM_API_KEY ? { 'Authorization': `Bearer ${LLM_API_KEY}` } : {})),
            body: JSON.stringify({
                model: model,
                prompt: prompt,
                temperature: 0.4,
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
        if (!result)
            return "...";
        return result;
    }
    catch (error) {
        console.error('LLM Fetch Error:', error);
        await logToServer(`LLM Fetch Error: ${String(error)}`);
        return "Hello there!";
    }
}
async function logToServer(message) {
    try {
        await fetch('/api/log', {
            method: 'POST',
            body: JSON.stringify({ message }),
        });
    }
    catch (e) {
        // ignore log error
    }
}

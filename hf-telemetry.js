(function () {
    const CONFIG = {
        // ENTRY POINT: Insert your free HF Inference Endpoint URL & Token
        HF_ENDPOINT: 'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-Coder-32B-Instruct',
        HF_TOKEN: '' /*[YOUR_TOKEN_HERE]*/,
        COOLDOWN_MS: 5000,
        SYSTEM_PROMPT: "You are an expert JavaScript debugger. Analyze this error, identify the root cause, and provide a corrected code snippet. Be concise."
    };

    let lastCallTime = 0;
    let isProcessing = false;

    const analyzeError = async (errorMessage, source, lineno, colno, errorObj) => {
        const now = Date.now();
        if (isProcessing || (now - lastCallTime < CONFIG.COOLDOWN_MS)) return;

        isProcessing = true;
        lastCallTime = now;

        const payload = {
            inputs: `${CONFIG.SYSTEM_PROMPT}\n\nError: ${errorMessage}\nFile: ${source}\nLine: ${lineno}\nColumn: ${colno}\nStack: ${errorObj?.stack || 'N/A'}`
        };

        try {
            console.warn('%c[HF Telemetry] Analyzing error...', 'color: #ff9800; font-weight: bold;');
            
            const response = await fetch(CONFIG.HF_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CONFIG.HF_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const result = await response.json();
            const aiResponse = result[0]?.generated_text || result.generated_text || result;
            
            console.group('%c[HF Telemetry] AI Debug Analysis', 'color: #00e676; font-weight: bold;');
            console.log(aiResponse.replace(payload.inputs, '').trim());
            console.groupEnd();

        } catch (e) {
            console.error('[HF Telemetry] Inference failed:', e.message);
        } finally {
            isProcessing = false;
        }
    };

    window.addEventListener('error', (event) => {
        analyzeError(event.message, event.filename, event.lineno, event.colno, event.error);
    });

    window.addEventListener('unhandledrejection', (event) => {
        analyzeError(event.reason?.message || 'Unhandled Promise Rejection', 'Async', 0, 0, event.reason);
    });
})();
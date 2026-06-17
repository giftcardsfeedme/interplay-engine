const API_URL = 'https://giftcardsfeedme-interplay-engine.hf.space';

async function runAnalysis(vocalData, drumData) {
    const res = await fetch(`${API_URL}/api/interplay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vocals: vocalData, drums: drumData })
    });

    if (!res.ok) {
        console.error('API error:', res.status, await res.text());
        return;
    }

    const { matrix } = await res.json();
    renderChart(matrix);
}

function renderChart(matrix) {
    const ctx = document.getElementById('interplayChart').getContext('2d');

    new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Latency (ms)',
                data: matrix.map(m => ({ x: m.time, y: m.latency })),
                backgroundColor: matrix.map(m =>
                    Math.abs(m.latency) < 20 ? '#2ed573' : '#ff4757'
                )
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    title: { display: true, text: 'Timestamp (s)' }
                },
                y: {
                    title: { display: true, text: 'Latency (ms)' }
                }
            }
        }
    });
}

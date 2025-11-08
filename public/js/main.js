document.addEventListener('DOMContentLoaded', () => {
    const recordBtn = document.getElementById('record-note-btn');
    const noteTextarea = document.getElementById('note-content');

    if (recordBtn) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();

            recordBtn.addEventListener('click', () => {
                recognition.start();
            });

            recognition.onstart = () => {
                recordBtn.textContent = '... Listening';
                recordBtn.disabled = true;
            };

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                noteTextarea.value = transcript;
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                alert(`Error: ${event.error}`);
            };

            recognition.onend = () => {
                recordBtn.textContent = '🎤 Record Note';
                recordBtn.disabled = false;
            };

        } else {
            recordBtn.style.display = 'none';
            console.log("Speech Recognition not supported in this browser.");
        }
    }
});
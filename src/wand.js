(function () {
	'use strict';

	function send(message) {
		if (!window.webviewApi || typeof window.webviewApi.postMessage !== 'function') return;
		Promise.resolve(window.webviewApi.postMessage(message)).catch(function (err) {
			if (window.console && window.console.warn) window.console.warn('Note AI: wand message failed', err);
		});
	}

	function readValue(id) {
		var el = document.getElementById(id);
		return el ? String(el.value || '') : '';
	}

	function setInputWarning(message) {
		var el = document.getElementById('noteAiInputWarning');
		if (!el) return;
		if (!message) {
			el.textContent = '';
			el.style.display = 'none';
			return;
		}
		el.textContent = message;
		el.style.display = 'block';
	}

	function sendGenerate() {
		var userInput = readValue('noteAiInput');
		if (!userInput.trim()) {
			setInputWarning('輸入內容為空，請先輸入內容');
			var input = document.getElementById('noteAiInput');
			if (input) input.focus();
			return;
		}
		setInputWarning('');
		send({ event: 'generate', userInput: userInput, instruction: readValue('noteAiInstruction') });
	}

	document.addEventListener('click', function (event) {
		var target = event.target;
		if (!target || !target.id) return;
		switch (target.id) {
			case 'noteAiGenerate':
				sendGenerate();
				break;
			case 'noteAiAppend':
				send({ event: 'append', result: readValue('noteAiResult') });
				break;
			case 'noteAiReplace':
				send({ event: 'replace', result: readValue('noteAiResult') });
				break;
		}
	}, true);

	document.addEventListener('keydown', function (event) {
		if (event && event.key === 'Enter' && event.target && event.target.id === 'noteAiInstruction') {
			event.preventDefault();
			sendGenerate();
		}
	}, true);
})();

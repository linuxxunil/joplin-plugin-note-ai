(function () {
	'use strict';

	var PREVIEW_PAIRS = {
		noteAiTogglePreview1: { textareaId: 'noteAiInput', previewId: 'noteAiPreview1' },
		noteAiTogglePreview2: { textareaId: 'noteAiResult', previewId: 'noteAiPreview2' },
	};

	function libsReady() {
		return typeof window !== 'undefined'
			&& window.marked
			&& typeof window.marked.parse === 'function'
			&& window.DOMPurify
			&& typeof window.DOMPurify.sanitize === 'function';
	}

	function renderPreview(textarea, previewDiv) {
		var html;
		try {
			html = window.DOMPurify.sanitize(window.marked.parse(textarea.value || '', { gfm: true }));
		} catch (err) {
			if (window.console && window.console.warn) window.console.warn('Note AI: markdown render failed', err);
			html = '';
		}
		if (!html) {
			previewDiv.textContent = textarea.value || '';
		} else {
			previewDiv.innerHTML = html;
		}
	}

	function togglePreview(button) {
		var pair = PREVIEW_PAIRS[button.id];
		if (!pair) return;
		var textarea = document.getElementById(pair.textareaId);
		var preview = document.getElementById(pair.previewId);
		if (!textarea || !preview) return;
		if (!libsReady()) return;

		var isPreviewing = preview.style.display === 'block';
		if (isPreviewing) {
			preview.style.display = 'none';
			textarea.style.display = '';
			button.textContent = '👁 預覽 Markdown';
		} else {
			renderPreview(textarea, preview);
			preview.style.display = 'block';
			textarea.style.display = 'none';
			button.textContent = '✏️ 回到編輯';
		}
	}

	function readConfigData() {
		var dataEl = document.getElementById('noteAiConfigData');
		if (!dataEl) return null;
		try {
			return JSON.parse(dataEl.textContent || '{}');
		} catch (err) {
			return null;
		}
	}

	function handleProviderChange(select) {
		var keyInput = document.getElementById('noteAiSettingsKey');
		var urlInput = document.getElementById('noteAiSettingsUrl');
		if (!keyInput || !urlInput) return;
		var data = readConfigData();
		if (!data) return;
		var id = String(select.value);
		var slot = data.slots && data.slots[id] ? data.slots[id] : {};
		var defaultUrl = data.defaults && data.defaults[id] ? data.defaults[id] : '';
		keyInput.value = slot.key || '';
		urlInput.value = slot.url || defaultUrl;
	}

	function handleActivate(event) {
		var target = event.target;
		if (!target || !target.id) return;
		if (PREVIEW_PAIRS[target.id]) {
			togglePreview(target);
			return;
		}
		var input = document.getElementById('noteAiInput');
		if (!input) return;
		if (target.id === 'noteAiReloadSource') {
			var source = document.getElementById('noteAiSource');
			input.value = source && source.textContent ? source.textContent : '';
		} else if (target.id === 'noteAiClearInput') {
			input.value = '';
			input.focus();
		}
	}

	document.addEventListener('click', handleActivate, true);

	document.addEventListener('change', function (event) {
		var target = event.target;
		if (target && target.id === 'noteAiSettingsProvider') {
			handleProviderChange(target);
		}
	}, true);

	document.addEventListener('submit', function (event) {
		event.preventDefault();
	}, true);
})();

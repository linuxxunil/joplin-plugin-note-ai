(function () {
	'use strict';

	function handleActivate(event) {
		var target = event.target;
		if (!target || !target.id) return;
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
})();

import joplin from 'api';

async function showMessageBox(message: string): Promise<void> {
	try {
		await joplin.views.dialogs.showMessageBox(message);
	} catch (error) {
		console.error('Note AI: showMessageBox failed', error);
	}
}

export async function showErrorBox(message: string): Promise<void> {
	await showMessageBox(`Note AI 錯誤:\n${message}`);
}

export async function showNoticeBox(message: string): Promise<void> {
	await showMessageBox(`Note AI:\n${message}`);
}

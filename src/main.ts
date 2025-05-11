import { App, Notice, Plugin, PluginSettingTab, requestUrl, Setting, normalizePath, RequestUrlResponse, TFolder } from 'obsidian';
import { getContents } from './contents';

// Remember to rename these classes and interfaces!
type LineMessage = {
	messageId: string;
	text: string;
	timestamp: string;
}

interface LineSettings {
	lineMessageEndpoint: string;
	documentDirectory: string;
}

const DEFAULT_SETTINGS: LineSettings = {
	lineMessageEndpoint: '',
	documentDirectory: ''
}

export default class LInePlugin extends Plugin {
	settings: LineSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('メッセージの同期を開始します');
			lineVaultManager.syncMessages();
			new Notice('メッセージの同期が完了しました');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a simple command that can be triggered anywhere
		const lineVaultManager = new LineVaultManager(this.app, this.settings);
		this.addCommand({
			id: 'sync-line-messages',
			name: 'Sync Line Messages',
			callback: () => {
				lineVaultManager.syncMessages();
				new Notice('メッセージの同期が完了しました');
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LineSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class LineVaultManager {
	constructor(private readonly app: App, private readonly lineSettings: LineSettings) {
	}

    private async getFilePath(message: LineMessage): Promise<string> {
        const fileName = `${new Date(message.timestamp).toISOString().split('T')[0]}-${message.messageId}.md`;
        return normalizePath(`${this.lineSettings.documentDirectory}/${fileName}`);
    }

	private async makeFolderIfNotExists(): Promise<void> {
		const normalizedPath = normalizePath(this.lineSettings.documentDirectory);
		const exists = await this.app.vault.adapter.exists(normalizedPath);
		if (!exists) {
			await this.app.vault.createFolder(normalizedPath);
		}
	}

	private async makeContents(message: LineMessage): Promise<string> {
		// return 'hoge';
		try {
			const contents = await getContents(message.text);
			return [
				`---`,
				`title: ${contents.title}`,
				`date: ${new Date(message.timestamp).toISOString()}`,
				`source: ${contents.source}`,
				`messageId: ${message.messageId}`,
				`tags: ${contents.tags.join(', ')}`,
				`---`,
				``,
				`${contents.content}`
			].join('\n');
		} catch (error) {
			new Notice(`メッセージの内容の取得に失敗しました: ${error}`);
			throw new Error(`メッセージの内容の取得に失敗しました: ${error}`);
		}
	}

	private async saveVaultIfNotExists(message: LineMessage): Promise<void> {
		const filePath = await this.getFilePath(message);
		const normalizedFilePath = normalizePath(filePath);
		const exists = await this.app.vault.adapter.exists(normalizedFilePath);
		if (!exists) {
			const contents = await this.makeContents(message)
			await this.app.vault.create(normalizedFilePath, contents);
			new Notice(`${filePath}に新規メッセージを保存しました`);
		}
	}

	async syncMessages(): Promise<void> {
		await this.makeFolderIfNotExists()
		let response: RequestUrlResponse;
		try {
			response = await requestUrl(this.lineSettings.lineMessageEndpoint);
		} catch (error) {
			new Notice(`LINEメッセージの取得に失敗しました: ${error}`);
			throw new Error(`LINEメッセージの取得に失敗しました: ${error}`);
		}

		const text = response.text;
		let messages: LineMessage[]
		try {
			messages = JSON.parse(text) as LineMessage[];
		} catch (parseError) {
			new Notice(`メッセージの同期に失敗しました: ${parseError}`);
			throw new Error(`メッセージの同期に失敗しました: ${parseError}`);
		}

		new Notice(`${messages.length}件のメッセージを取得しました`);
		for (const message of messages) {
			await this.saveVaultIfNotExists(message);
		}
	}
}

class LineSettingTab extends PluginSettingTab {
	plugin: LInePlugin;

	constructor(app: App, plugin: LInePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private async getAllFolders(): Promise<Record<string, string>> {
		const folders: Record<string, string> = {};
		const files = this.app.vault.getAllLoadedFiles();
		
		for (const file of files) {
			if (file instanceof TFolder) {
				folders[file.path] = file.path;
			}
		}
		
		return folders;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Line Message Endpoint')
			.setDesc('メッセージ取得のためのエンドポイント')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.lineMessageEndpoint)
				.onChange(async (value) => {
					this.plugin.settings.lineMessageEndpoint = value;
					await this.plugin.saveSettings();
				}));

		new Setting(this.containerEl)
			.setName('Document Directory')
			.setDesc('ドキュメントを保存するディレクトリのパス')
			.addDropdown(async (dropdown) => {
				const folders = await this.getAllFolders();
				Object.keys(folders).forEach((val) => {
					dropdown.addOption(val, val);
				});
				dropdown.onChange(async (value) => {
					this.plugin.settings.documentDirectory = value;
					await this.plugin.saveSettings();
				});
			});
	}
}

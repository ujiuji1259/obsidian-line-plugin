import { App, Notice, Plugin, PluginSettingTab, requestUrl, Setting, normalizePath, RequestUrlResponse, TFolder } from 'obsidian';
import { getContents, Content } from './contents';

// Remember to rename these classes and interfaces!
type LineMessage = {
	messageId: string;
	text: string;
	timestamp: string;
}

interface LineSettings {
	lineMessageEndpoint: string;
	documentDirectory: string;
	clippingDirectory: string;
	codeDirectory: string;
}

const DEFAULT_SETTINGS: LineSettings = {
	lineMessageEndpoint: '',
	documentDirectory: '',
	clippingDirectory: '',
	codeDirectory: ''
}

export default class LInePlugin extends Plugin {
	settings: LineSettings;

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

	private async getVaultDirectory(content: Content): Promise<string> {
		if (content.source === 'Web') {
			return this.lineSettings.clippingDirectory;
		}
		if (content.source === 'GitHub') {
			return this.lineSettings.codeDirectory;
		}
		if (content.source === 'LINE') {
			return this.lineSettings.documentDirectory;
		}
		return this.lineSettings.documentDirectory;
	}

    private async getFilePath(contents: Content, message: LineMessage): Promise<string> {
		if (contents.source === 'Web') {
			return `${this.lineSettings.clippingDirectory}/${contents.title}.md`;
		}
		if (contents.source === 'GitHub') {
			return `${this.lineSettings.codeDirectory}/${contents.title}.md`;
		}
		return `${this.lineSettings.documentDirectory}/${new Date(message.timestamp).toISOString().split('T')[0]}-${message.messageId}.md.md`;
    }

	private async makeFolderIfNotExists(): Promise<void> {
		const folders = [
			this.lineSettings.documentDirectory,
			this.lineSettings.clippingDirectory,
			this.lineSettings.codeDirectory,
		]
		for (const folder of folders) {
			const normalizedPath = normalizePath(folder);
			const exists = await this.app.vault.adapter.exists(normalizedPath);
			if (!exists) {
				await this.app.vault.createFolder(normalizedPath);
			}
		}
	}

	private async makeContents(contents: Content, message: LineMessage): Promise<string> {
		// return 'hoge';
		try {
			return [
				`---`,
				`title: ${contents.title}`,
				`date: ${new Date(message.timestamp).toISOString()}`,
				`source: ${contents.source}`,
				`messageId: ${message.messageId}`,
				`url: ${contents.url}`,
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
		const contents = await getContents(message.text);
		const filePath = await this.getFilePath(contents, message);
		const normalizedFilePath = normalizePath(filePath);
		const exists = await this.app.vault.adapter.exists(normalizedFilePath);
		if (!exists) {
			const vaultMessage = await this.makeContents(contents, message);
			await this.app.vault.create(normalizedFilePath, vaultMessage);
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
				dropdown.setValue(this.plugin.settings.documentDirectory);
				dropdown.onChange(async (value) => {
					this.plugin.settings.documentDirectory = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName('Clipping Directory')
			.setDesc('クリッピングを保存するディレクトリのパス')
			.addDropdown(async (dropdown) => {
				const folders = await this.getAllFolders();
				Object.keys(folders).forEach((val) => {
					dropdown.addOption(val, val);
				});
				dropdown.setValue(this.plugin.settings.clippingDirectory);
				dropdown.onChange(async (value) => {
					this.plugin.settings.clippingDirectory = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName('Code Directory')
			.setDesc('コードを保存するディレクトリのパス')
			.addDropdown(async (dropdown) => {
				const folders = await this.getAllFolders();
				Object.keys(folders).forEach((val) => {
					dropdown.addOption(val, val);
				});
				dropdown.setValue(this.plugin.settings.codeDirectory);
				dropdown.onChange(async (value) => {
					this.plugin.settings.codeDirectory = value;
					await this.plugin.saveSettings();
				});
			});
	}
}

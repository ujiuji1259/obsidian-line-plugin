import { requestUrl, normalizePath } from 'obsidian';



export default class Line {
	constructor(private readonly lineMessageEndpoint: string, private readonly documentDirectory: string) {
	}

	async getMessages(): Promise<LineMessage[]> {
		const response = await requestUrl(this.lineMessageEndpoint);
		const messages = await response.json() as LineMessage[];
		return messages;
	}

    async getFilePath(message: LineMessage): Promise<string> {
        const fileName = `${new Date(message.timestamp).toISOString().split('T')[0]}-${message.messageId}.md`;
        return normalizePath(`${this.documentDirectory}/${fileName}`);
    }
}

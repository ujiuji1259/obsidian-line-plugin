import { requestUrl } from 'obsidian';
import { JSDOM } from 'jsdom';
import { Defuddle } from 'defuddle/node';
import TurndownService from 'turndown';

type Content = {
    title: string;
    content: string;
    source: string;
    tags: string[];
}

export async function getContents(message: string): Promise<Content> {
    let contents: Content;

    const githubClipper = new GitHubClipper();
    const webClipper = new WebClipper();

    if (message.startsWith('https://github.com/')) {
        contents = await githubClipper.getContents(message);
    } else if (message.startsWith('https://')) {
        contents = await webClipper.getContents(message);
    } else {
        contents = {
            title: message,
            content: message,
            source: 'LINE',
            tags: [],
        }
    }
    return contents;
}

class WebClipper {
    async getContents(url: string): Promise<Content> {
        const contents = await requestUrl(url);
        const dom = new JSDOM(contents.text);
        const result = await Defuddle(dom);

        const turndownService = new TurndownService({ headingStyle: 'atx' })
        const markdown = turndownService.turndown(result.content)
        result.content = markdown;

        return {
            title: result.title,
            content: result.content,
            source: url,
            tags: [],
        }
    }
}

class GitHubClipper {
    async getContents(url: string): Promise<Content> {
        // Convert github.com to uithub.com
        const uithubUrl = url.replace('github.com', 'uithub.com');
        
        // Extract username and repository from URL
        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        const username = match ? match[1] : '';
        const repo = match ? match[2] : '';
        
        const response = await requestUrl(uithubUrl);
        return {
            title: `${username}/${repo}`,
            content: response.text,
            source: url,
            tags: ['github'],
        };
    }
}

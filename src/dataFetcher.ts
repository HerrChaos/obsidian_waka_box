import { Summary } from "model";
import { App, normalizePath, Notice, request } from "obsidian";
import { WakaBoxPluginSettings } from "settings";

export class SummaryDataFetcher {

	private app: App;
	private cacheDir: string;

	constructor(app: App) {
		this.app = app;
		this.createCacheDir();
	}

	async createCacheDir() {
		const cacheDir = normalizePath(this.app.vault.configDir + "/" + ".waka_box_cache");
		const exists = await this.app.vault.adapter.exists(cacheDir);
		if (!exists) {
			await this.app.vault.adapter.mkdir(cacheDir);
		}
		this.cacheDir = cacheDir;
	}

	async loadFromCache(cacheKey: string): Promise<Summary | undefined> {
		await this.createCacheDir();
		const cacheFilePath = normalizePath(this.cacheDir + "/" + cacheKey);
		const exists = await this.app.vault.adapter.exists(cacheFilePath);
		const vaildTill = new Date();
		vaildTill.setHours(vaildTill.getHours() - 1);
		if (!exists) {
			return undefined;
		}
		try {
			const stat = await this.app.vault.adapter.stat(cacheFilePath);
			const metadata = stat?.mtime;
			if (metadata) {
				const lastModified = new Date(metadata);
				if (lastModified < vaildTill) {
					return undefined;
				}
			}

			const data = await this.app.vault.adapter.read(cacheFilePath);
			const summary = JSON.parse(data) as Summary;
			return summary;
		} catch (e) {
			console.error("WakaTime box: Error loading WakaTime summary from cache: " + e);
		}
		return undefined;
	}

	async saveToCache(cacheKey: string, summary: Summary) {
		try {
			await this.app.vault.adapter.write(normalizePath(this.cacheDir + "/" + cacheKey), JSON.stringify(summary));
		} catch (e) {
			console.error("WakaTime box: Error saving WakaTime summary to cache: " + e);
		}
	}

	async fetchViaAPI(url: string, date: string): Promise<Summary | undefined> {
		console.log("start request for " + date);
		try {
			const result = await request(url);
			const summary = JSON.parse(result) as Summary;
			console.log("success request for " + date + " from wakatime API");
			this.saveToCache(date, summary);
			return summary;
		} catch (error) {
			console.error("WakaTime box: error requesting WakaTime summary: " + error);
			new Notice('WakaTime box: error requesting WakaTime summary: ' + error, 5000);
			return undefined;
		}
	}

	// read cache or fetch data from wakatime
	async requestWakaTimeSummary(settings: WakaBoxPluginSettings, date: string, force: boolean, callback: (summary: Summary | undefined, fromCache: boolean) => void) {
		const baseUrl = settings.apiBaseUrl + "/users/current/summaries"
		const url = baseUrl + "?start=" + date + "&end=" + date + "&api_key=" + settings.apiKey;
		try {
			if (force) {
				const result = await this.fetchViaAPI(url, date);
				callback(result, false);
				return;
			}
			const cacheResult = await this.loadFromCache(date);
			if (cacheResult != undefined) {
				console.log("success request for " + date + " from cache");
				callback(cacheResult, true);
				return;
			}
			const apiResult = await this.fetchViaAPI(url, date);
			callback(apiResult, false);
		} catch (e) {
			console.error("WakaTime box: error requesting WakaTime summary: " + e);
			new Notice('WakaTime box: error requesting WakaTime summary: ' + e, 5000);
			callback(undefined, false);
		}
	}

}
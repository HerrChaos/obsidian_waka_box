import { ChartType } from "chart.js";
import WakaBoxPlugin from "main";
import { App, PluginSettingTab, Setting } from "obsidian";

interface TypeDisplayOptions {
    Project: () => void,
    Language: () => void,
    Editor: () => void,
    Machine: () => void,
    OperatingSystem: () => void,
}

export type DataDisplayType = keyof TypeDisplayOptions;

export interface WakaBoxPluginSettings {
    apiKey: string;
    apiBaseUrl: string;
    dateFormat: string;
    chartType: ChartType;
    typeDisplay: DataDisplayType;
    displayTotatlTime: boolean;
    showLegend: boolean;
}

export const DEFAULT_SETTINGS: WakaBoxPluginSettings = {
    apiKey: '',
    apiBaseUrl: 'https://wakatime.com/api/v1',
    dateFormat: 'YYYY-MM-DD',
    chartType: 'doughnut',
    typeDisplay: 'Project',
    displayTotatlTime: true,
    showLegend: true,
}

export class WakaBoxSettingTab extends PluginSettingTab {
    plugin: WakaBoxPlugin;

    constructor(app: App, plugin: WakaBoxPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h1', { text: 'WakaTime box settings' });

        new Setting(containerEl)
            .setName('API')
            .setHeading();

        new Setting(containerEl)
            .setName('WakaTime API key')
            .setDesc('Your WakaTime API key. You can find it in your WakaTime account settings.')
            .addText(text => text
                .setValue(this.plugin.settings.apiKey)
                .setPlaceholder('Enter your API key')
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                    this.plugin.onGetAPIKey();
                }));

        new Setting(containerEl)
            .setName('WakaTime API base URL')
            .setDesc('The base URL for the WakaTime API e.g.: https://wakatime.com/api/v1')
            .addText(text => text
                .setValue(this.plugin.settings.apiBaseUrl)
                .setPlaceholder('Enter the base API URL')
                .onChange(async (value) => {
                    this.plugin.settings.apiBaseUrl = value;
                    await this.plugin.saveSettings();
                    this.plugin.onGetAPIKey();
                }));

        new Setting(containerEl)
            .setName('Look')
            .setHeading();

        new Setting(containerEl)
            .setName('Chart type')
            .setDesc('The type of chart to display.')
            .addDropdown((dropdown) => {
                dropdown.addOptions({
                    'doughnut': 'Doughnut',
                    'bar': 'Bar',
                    'pie': 'Pie',
                    'radar': 'Radar',
                    'polarArea': 'Polar Area',
                })
                .setValue(this.plugin.settings.chartType)
                .onChange(async (value) => {
                    this.plugin.settings.chartType = value as ChartType;
                    await this.plugin.saveSettings();
                    this.plugin.onGetAPIKey();
                    this.display();
                })});

        new Setting(containerEl)
            .setName('Display Type')
            .setDesc('The type of data to display in the chart.')
            .addDropdown((dropdown) => {
                dropdown.addOptions({
                    'Project': 'Project',
                    'Language': 'Language',
                    'Editor': 'Editor',
                    'Machine': 'Machine',
                    'OperatingSystem': 'Operating System',
                })
                .setValue(this.plugin.settings.typeDisplay)
                .onChange(async (value) => {
                    this.plugin.settings.typeDisplay = value as DataDisplayType;
                    await this.plugin.saveSettings();
                    this.plugin.onGetAPIKey();
                    this.display();
                })});


        new Setting(containerEl)
            .setName('Display total time')
            .setDesc('Whether to display the total time in the chart.')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.displayTotatlTime)
                .onChange(async (value) => {
                    this.plugin.settings.displayTotatlTime = value;
                    await this.plugin.saveSettings();
                    this.plugin.onGetAPIKey();
                    this.display();
                })});


                /*
        new Setting(containerEl)
            .setName('Date format')
            .setDesc('The format of the Date for the daily note e.g.: YYYY-MM-DD (' + moment().format(this.plugin.settings.dateFormat).toString() + ')')
            .addText(text => text
                .setValue(this.plugin.settings.dateFormat)
                .setPlaceholder('The format of the Date which the daily notes are in')
                .onChange(async (value) => {
                    this.plugin.settings.dateFormat = value;
                    await this.plugin.saveSettings();
                    this.plugin.onGetAPIKey();
                    this.display();
                }));
                */

        new Setting(containerEl).addButton((btn) =>
            btn
            .setWarning()
            .setButtonText("Reset settings")
            .setCta()
            .onClick(async () => {
                this.plugin.settings = DEFAULT_SETTINGS;
                await this.plugin.saveSettings();
                this.plugin.onGetAPIKey();
                this.display(); // Refresh the display to show updated settings
            }));
    }
}
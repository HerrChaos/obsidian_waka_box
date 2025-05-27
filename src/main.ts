import { App, Notice, Plugin, Setting, moment, TFile, Modal, setIcon } from 'obsidian';
import { Summary } from './model';
import { appHasDailyNotesPluginLoaded, createDailyNote, getAllDailyNotes, getDailyNote } from "obsidian-daily-notes-interface";
import { DEFAULT_SETTINGS, WakaBoxPluginSettings, WakaBoxSettingTab } from 'settings';
import { SummaryDataFetcher } from 'dataFetcher';
import Chart from 'chart.js/auto'

export default class WakaBoxPlugin extends Plugin {
	settings: WakaBoxPluginSettings;
	private summaryFetcher: SummaryDataFetcher | undefined;

	async onload() {
		this.addSettingTab(new WakaBoxSettingTab(this.app, this));
		this.app.workspace.onLayoutReady(() => {
			this.onLayoutReady();
		});
	}

	onLayoutReady() {
		if (!appHasDailyNotesPluginLoaded()) {
			new Notice('WakaTime box: please enable daily notes plugin.', 5000);
		}
		this.loadSettings().then(() => {
			if (this.settings.apiKey.trim() == '') {
				new Notice('WakaTime box: please enter your API key in the settings.', 5000);
				return;
			}
			this.onGetAPIKey();
		});
	}

	onGetAPIKey() {
		if (this.settings.apiKey.trim() == '') {
			return;
		}

		this.addCommand({
			id: "refresh-today",
			name: "Force refetch today's data",
			callback: () => {
				if (this.settings.apiKey.trim() == '') {
					new Notice('WakaTime box: please enter your API key in the settings.', 5000);
					return;
				}
				const date = moment().format(this.settings.dateFormat);
				if (this.summaryFetcher != undefined) {
					this.summaryFetcher.requestWakaTimeSummary(this.settings, date, true, this.onFetchedSummary);
				}
			}
		})

		this.addCommand({
			id: "refresh-yesterday",
			name: "Force refetch yesterday's data",
			callback: () => {
				if (this.settings.apiKey.trim() == '') {
					new Notice('WakaTime box: please enter your API key in the settings.', 5000);
					return;
				}
				const date = moment().subtract(1, 'days').format(this.settings.dateFormat);
				if (this.summaryFetcher != undefined) {
					this.summaryFetcher.requestWakaTimeSummary(this.settings, date, true, this.onFetchedSummary);
				}
			}
		})


		this.addCommand({
			id: "refresh-current",
			name: "Force refetch the statistics of the currently open daily note",
			callback: () => {
				if (this.settings.apiKey.trim() == '') {
					new Notice('WakaTime box: please enter your API key in the settings.', 5000);
					return;
				}

				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice('WakaTime box: No active file found.', 3000);
					return;
				}

				// Get the current note title without extension
				const title = activeFile.basename;

				// Try to parse the title as a date
				try {
					const date = moment(title).format(this.settings.dateFormat);
					if (!date || date === "Invalid date") {
						new Notice('WakaTime box: Current note title is not a valid date.', 3000);
						return;
					}
					
					if (this.summaryFetcher != undefined) {
						this.summaryFetcher.requestWakaTimeSummary(this.settings, date, true, this.onFetchedSummary);
						new Notice(`WakaTime box: Fetching data for ${date}`, 3000);
					}
				} catch (e) {
					new Notice(`WakaTime box: Failed to parse date from title: ${e}`, 3000);
					return;
				}
			}
		})

		this.addCommand({
			id: "refresh-manual",
			name: "Fetch specific date's data and copy to clipboard",
			callback: () => {
				if (this.settings.apiKey.trim() == '') {
					new Notice('WakaTime box: please enter your API key in the settings.', 5000);
					return;
				}
				new ManualModal(this.app, (result: string) => {
					try {
						const date = moment(result).format(this.settings.dateFormat);
						if (this.summaryFetcher != undefined) {
							this.summaryFetcher.requestWakaTimeSummary(this.settings, date, true, (summary: Summary | undefined, _: boolean) => {
								if (summary == undefined) {
									console.warn("WakaTime box: no summary data received");
									return;
								}
								const box = this.getBoxText(summary);
								navigator.clipboard.writeText(box).then(() => {
									new Notice("WakaTime box: " + date + " copied to clipboard", 3000);
								});
							});
						}
					} catch (e) {
						new Notice(`WakaTime box: fail due to ${e}`, 5000);
						return;
					}
				}).open();
			}
		})

		this.summaryFetcher = new SummaryDataFetcher(this.app);
		if (this.summaryFetcher != undefined) {
		const date = moment().format(this.settings.dateFormat);
		this.summaryFetcher.requestWakaTimeSummary(this.settings, date, false, this.onFetchedSummary);
		}

		if (this.settings.updateInterval != 0) {
			const interval = this.settings.updateInterval * 60000; // Convert minutes to milliseconds
			this.registerInterval(window.setInterval(() => {
			console.log("WakaTime box: update interval is set to " + this.settings.updateInterval + " minutes");
				if (this.summaryFetcher != undefined) {
					const date = moment().format(this.settings.dateFormat);
					this.summaryFetcher.requestWakaTimeSummary(this.settings, date, false, this.onFetchedSummary);
				}
			}, interval));
		}

		this.registerMarkdownCodeBlockProcessor("wakatime", (source, el, _ctx) => {
			try {
				const summary: Summary = JSON.parse(source);
				
				// Flatten project data from all days
				const allProjects: {name: string, total_seconds: number}[] = [];
				
				this.parseSummaryData(summary, allProjects);
				
				// Sort projects by time spent
				allProjects.sort((a, b) => b.total_seconds - a.total_seconds);

				const data = {
					labels: allProjects.map(project => project.name),
					datasets: [
						{
							label: 'Time Spent (seconds)',
							data: allProjects.map(project => project.total_seconds),
							borderWidth: 1
						}
					]
				};
				
				const config = {
					type: this.settings.chartType,
					data: data,
					options: {
						responsive: true,
						plugins: {
							legend: {
								position: 'right' as const,
								display: this.settings.showLegend,
							},
							title: {
								display: false,
								text: 'WakaTime Chart'
							},
							tooltip: {
								callbacks: {
									label: function(context: any) {
										const seconds = context.raw;
										const hours = Math.floor(seconds / 3600);
										const minutes = Math.floor((seconds % 3600) / 60);
										return `${context.label}: ${hours}h ${minutes}m`;
									}
								}
							}
						}
					},
				};

				if (this.settings.displayTotatlTime) {
					el.createEl("p", {
						text: `Total: ${Math.floor(summary.cumulative_total.seconds / 3600)}h ${Math.floor((summary.cumulative_total.seconds % 3600) / 60)}m`,
						cls: "wakatime-total-time"
					});
				}

				const chartEl = el.createEl("canvas", { cls: "wakatime-chart" });
				
				new Chart(chartEl, config);

				// Add right-click context menu to the chart element
				el.addEventListener('contextmenu', (e: MouseEvent) => {
					e.preventDefault();
					
					// Create a simple context menu
					const menu = document.createElement('div');
					menu.className = 'wakatime-context-menu';
					menu.style.position = 'absolute';
					menu.style.left = `${e.pageX}px`;
					menu.style.top = `${e.pageY}px`;
					menu.style.borderRadius = '4px';
					menu.style.zIndex = '1000';
					
					// Add copy to clipboard option
					const refreshButton = document.createElement('button');
					setIcon(refreshButton, "refresh-ccw");
					refreshButton.onclick = () => {
						const activeFile = this.app.workspace.getActiveFile();
						if (activeFile) {
							try {
								const title = activeFile.basename;
								const date = moment(title).format(this.settings.dateFormat);
								if (date && date !== "Invalid date") {
									this.summaryFetcher?.requestWakaTimeSummary(this.settings, date, true, this.onFetchedSummary);
								} else {
									// If invalid date format, fall back to today
									this.summaryFetcher?.requestWakaTimeSummary(this.settings, moment().format(this.settings.dateFormat), true, this.onFetchedSummary);
								}
							} catch (e) {
								// If any error, fall back to today
								this.summaryFetcher?.requestWakaTimeSummary(this.settings, moment().format(this.settings.dateFormat), true, this.onFetchedSummary);
							}
						} else {
							// No active file, use today's date
							this.summaryFetcher?.requestWakaTimeSummary(this.settings, moment().format(this.settings.dateFormat), true, this.onFetchedSummary);
						}
						new Notice("WakaTime box: Refreshed today's data", 5000);
						document.body.removeChild(menu);
					};
					menu.appendChild(refreshButton);
					
					// Close menu when clicking outside
					const closeMenu = () => {
						if (document.body.contains(menu)) {
							document.body.removeChild(menu);
						}
						document.removeEventListener('click', closeMenu);
					};
					
					document.body.appendChild(menu);
					setTimeout(() => {
						el.addEventListener('click', closeMenu);
						el.addEventListener('contextmenu', closeMenu);
						document.addEventListener('click', closeMenu);
					}, 100);
				});
			} catch (error) {
				console.error("Failed to create chart:", error);
				el.setText(`Error rendering WakaTime chart: ${error.message}`);
			}
		})
	}

	private parseSummaryData(summary: Summary, allProjects: { name: string; total_seconds: number; }[]) {	
		if (summary.data && summary.data.length > 0) {
			switch (this.settings.typeDisplay) {
				case "Project":
					WakaBoxPlugin.parseSummaryForProjects(summary).forEach(project => {
						allProjects.push({
							name: project.name,
							total_seconds: project.total_seconds
						});
					});
					break;

				case "Language":
					WakaBoxPlugin.parseSummaryForLanguages(summary).forEach(project => {
						allProjects.push({
							name: project.name,
							total_seconds: project.total_seconds
						});
					});
					break;

				case "Editor":
					WakaBoxPlugin.parseSummaryForEditors(summary).forEach(project => {
						allProjects.push({
							name: project.name,
							total_seconds: project.total_seconds
						});
					});
					break;

				case "Machine":
					WakaBoxPlugin.parseSummaryForMachine(summary).forEach(project => {
						allProjects.push({
							name: project.name,
							total_seconds: project.total_seconds
						});
					});
					break;
				case "OperatingSystem":
					WakaBoxPlugin.parseSummaryForOperatingSystem(summary).forEach(project => {
						allProjects.push({
							name: project.name,
							total_seconds: project.total_seconds
						});
					});
					break;
			}
		}
	}

	public static parseSummaryForProjects(summary: Summary): { name: string; total_seconds: number; }[] {
		const allProjects: { name: string; total_seconds: number; }[] = [];
		
		summary.data.forEach(day => {
			if (day.projects && day.projects.length > 0) {
				day.projects.forEach(project => {
					// Check if project already exists in our array
					const existingProject = allProjects.find(p => p.name === project.name);
					if (existingProject) {
						existingProject.total_seconds = project.total_seconds;
					} else {
						allProjects.push({
							name: project.name,
							total_seconds: project.total_seconds
						});
					}
				});
			}
		});

		return allProjects;
	}

	public static parseSummaryForLanguages(summary: Summary): { name: string; total_seconds: number; }[] {
		const allProjects: { name: string; total_seconds: number; }[] = [];
		
		summary.data.forEach(day => {
			if (day.languages && day.languages.length > 0) {
				day.languages.forEach(project => {
					// Check if project already exists in our array
					const existingProject = allProjects.find(p => p.name === project.name);
					if (existingProject) {
						existingProject.total_seconds = project.total_seconds;
					} else {
						allProjects.push({
							name: project.name,
							total_seconds: project.total_seconds
						});
					}
				});
			}
		});

		return allProjects;
	}

	public static parseSummaryForMachine(summary: Summary): { name: string; total_seconds: number; }[] {
		const allProjects: { name: string; total_seconds: number; }[] = [];
		
		summary.data.forEach(day => {
			if (day.machines && day.machines.length > 0) {
				day.machines.forEach(project => {
					// Check if project already exists in our array
					const existingProject = allProjects.find(p => p.name === project.name);
					if (existingProject) {
						existingProject.total_seconds = project.total_seconds;
					} else {
						allProjects.push({
							name: project.name,
							total_seconds: project.total_seconds
						});
					}
				});
			}
		});

		return allProjects;
	}

	public static parseSummaryForOperatingSystem(summary: Summary): { name: string; total_seconds: number; }[] {
		const allProjects: { name: string; total_seconds: number; }[] = [];
		
		summary.data.forEach(day => {
			if (day.operating_systems && day.operating_systems.length > 0) {
				day.operating_systems.forEach(project => {
					// Check if project already exists in our array
					const existingProject = allProjects.find(p => p.name === project.name);
					if (existingProject) {
						existingProject.total_seconds = project.total_seconds;
					} else {
						allProjects.push({
							name: project.name,
							total_seconds: project.total_seconds
						});
					}
				});
			}
		});

		return allProjects;
	}

	public static parseSummaryForEditors(summary: Summary): { name: string; total_seconds: number; }[] {
		const allProjects: { name: string; total_seconds: number; }[] = [];
		
		summary.data.forEach(day => {
			if (day.editors && day.editors.length > 0) {
				day.editors.forEach(project => {
					// Check if project already exists in our array
					const existingProject = allProjects.find(p => p.name === project.name);
					if (existingProject) {
						existingProject.total_seconds = project.total_seconds;
					} else {
						allProjects.push({
							name: project.name,
							total_seconds: project.total_seconds
						});
					}
				});
			}
		});

		return allProjects;
	}

	onunload() {
		this.summaryFetcher = undefined;
	}

	onFetchedSummary = (summary: Summary | undefined, fromCache: boolean) => {
		if (summary == undefined) {
			console.warn("WakaTime box: no summary data received");
			return;
		}
		const momentDate = moment.utc(summary.start).local();
		const dailyNotes = getAllDailyNotes();
		const dailyNode = getDailyNote(momentDate, dailyNotes)
		if (dailyNode == undefined) {
			if (this.settings.createDailyNote) {
				createDailyNote(momentDate).then((file) => {
					this.processDailyNote(file, summary, fromCache);
				});
			}
		} else {
			this.processDailyNote(dailyNode, summary, fromCache);
		}
		if (!fromCache) {
			new Notice("WakaTime box: " + momentDate.format("YYYY-MM-DD") + " refreshed", 5000);
		}
	}

	processDailyNote(file: TFile, summary: Summary, fromCache: boolean) {
		console.log("refreshing daily note. fromCache: " + fromCache + ", file: " + file.name);
		this.app.vault.process(file, (data: string) => {
			const box = this.getBoxText(summary);
			const exists = data.includes("```wakatime");
			if (exists) {
				data = data.replace(/```wakatime[\s\S]*```/g, box);
			} else {
				data += box;
			}
			return data;
		});
	}

	private getBoxText(summary: Summary) {
		let box = "";
		box += "```wakatime\n";
		box += `${JSON.stringify(summary, null, 2)}\n`;
		box += "```";
		return box;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


export class ManualModal extends Modal {
	onResult: (result: string) => void;
	result = "";

	constructor(app: App, onResult: (result: string) => void) {
		super(app);
		this.onResult = onResult;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h1", { text: "Manual fetch WakaTime box" });

		new Setting(contentEl)
			.setName("Enter the date you want to fetch")
			.setDesc("Format: YYYY-MM-DD")
			.addText((text) => {
				const date = moment().format("YYYY-MM-DD");
				text.setValue(date);
				text.onChange((value) => {
					this.result = value
				})
			});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Submit")
					.setCta()
					.onClick(() => {
						this.close();
						this.onResult(this.result);
					}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

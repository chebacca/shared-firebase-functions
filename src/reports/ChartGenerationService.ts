import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration } from 'chart.js';

export class ChartGenerationService {
    private width: number;
    private height: number;
    private chartJSNodeCanvas: ChartJSNodeCanvas;

    constructor(width = 1200, height = 600) {
        this.width = width;
        this.height = height;

        this.chartJSNodeCanvas = new ChartJSNodeCanvas({
            width: this.width,
            height: this.height,
            backgroundColour: 'white',
            plugins: {
                modern: ['chartjs-plugin-datalabels']
            }
        });
    }

    async generateChart(configuration: ChartConfiguration): Promise<Buffer> {
        return this.chartJSNodeCanvas.renderToBuffer(configuration);
    }

    async generateBudgetChart(budgetData: any): Promise<Buffer> {
        const configuration: ChartConfiguration = {
            type: 'pie',
            data: {
                labels: ['Allocated', 'Spent', 'Remaining'],
                datasets: [{
                    data: [
                        budgetData.allocated || 0,
                        budgetData.spent || 0,
                        (budgetData.allocated || 0) - (budgetData.spent || 0)
                    ],
                    backgroundColor: ['#667eea', '#764ba2', '#e2e8f0'],
                    borderWidth: 1
                }]
            },
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: 'Budget Allocation Overview',
                        font: { size: 24 }
                    }
                }
            }
        };
        return this.generateChart(configuration);
    }

    async generateTimelineChart(sessions: any[]): Promise<Buffer> {
        // Basic timeline chart implementation
        const configuration: ChartConfiguration = {
            type: 'bar',
            data: {
                labels: sessions.map(s => s.name || s.id),
                datasets: [{
                    label: 'Duration (hours)',
                    data: sessions.map(s => s.duration || 0),
                    backgroundColor: '#667eea'
                }]
            },
            options: {
                indexAxis: 'y',
                plugins: {
                    title: {
                        display: true,
                        text: 'Production Timeline',
                        font: { size: 24 }
                    }
                },
                scales: {
                    x: { beginAtZero: true }
                }
            }
        };
        return this.generateChart(configuration);
    }

    async generateTeamPerformanceChart(teamData: any[]): Promise<Buffer> {
        const configuration: ChartConfiguration = {
            type: 'radar',
            data: {
                labels: ['Efficiency', 'Quality', 'Punctuality', 'Communication', 'Technical Skill'],
                datasets: teamData.map((member, index) => ({
                    label: member.name || `Member ${index + 1}`,
                    data: [
                        member.efficiency || 50,
                        member.quality || 50,
                        member.punctuality || 50,
                        member.communication || 50,
                        member.technicalSkill || 50
                    ],
                    borderColor: `hsl(${index * 137.5}, 70%, 50%)`,
                    backgroundColor: `hsla(${index * 137.5}, 70%, 50%, 0.2)`
                }))
            },
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: 'Team Performance Metrics',
                        font: { size: 24 }
                    }
                }
            }
        };
        return this.generateChart(configuration);
    }

    async generateDeliverablesChart(deliverables: any[]): Promise<Buffer> {
        const statusCounts = deliverables.reduce((acc, curr) => {
            const status = curr.status || 'Unknown';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const configuration: ChartConfiguration = {
            type: 'doughnut',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: ['#48bb78', '#f6e05e', '#f56565', '#4299e1', '#a0aec0']
                }]
            },
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: 'Deliverables Status',
                        font: { size: 24 }
                    }
                }
            }
        };
        return this.generateChart(configuration);
    }
}

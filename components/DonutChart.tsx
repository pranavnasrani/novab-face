import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { ChartBarIcon } from './icons';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const COLORS = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#eef2ff'];

interface DonutChartProps {
    data: { name: string; value: number }[];
}

export const DonutChart: React.FC<DonutChartProps> = ({ data }) => {
    const { t } = useTranslation();
    const total = data.reduce((acc, entry) => acc + entry.value, 0);
    if (total === 0) return (
        <div className="flex flex-col items-center justify-center text-slate-500 p-8 h-64">
             <ChartBarIcon className="w-12 h-12 mb-4" />
            <p>{t('noSpendingData')}</p>
        </div>
    );
    
    let cumulative = 0;
    const segments = data.map((entry, i) => {
        const percentage = entry.value / total;
        const startAngle = cumulative * 360;
        const endAngle = (cumulative + percentage) * 360;
        cumulative += percentage;

        const largeArcFlag = percentage > 0.5 ? 1 : 0;
        const x1 = 50 + 40 * Math.cos(Math.PI * startAngle / 180);
        const y1 = 50 + 40 * Math.sin(Math.PI * startAngle / 180);
        const x2 = 50 + 40 * Math.cos(Math.PI * endAngle / 180);
        const y2 = 50 + 40 * Math.sin(Math.PI * endAngle / 180);
        
        return {
            path: `M ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2}`,
            color: COLORS[i % COLORS.length]
        };
    });

    return (
        <div className="flex flex-col md:flex-row items-center gap-6 p-4">
            <div className="relative w-48 h-48">
                <svg viewBox="0 0 100 100" className="transform -rotate-90">
                    {segments.map((segment, i) => (
                        <path key={i} d={segment.path} stroke={segment.color} strokeWidth="20" fill="none" />
                    ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xs text-slate-400">Total</span>
                    <span className="font-bold text-white text-lg">{formatCurrency(total)}</span>
                </div>
            </div>
            <ul className="w-full max-w-xs">
                {data.map((entry, i) => (
                    <li key={i} className="flex items-center justify-between py-1.5 text-sm">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="text-slate-300">{entry.name}</span>
                        </div>
                        <span className="font-medium text-white">{formatCurrency(entry.value)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};
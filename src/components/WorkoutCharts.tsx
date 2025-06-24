import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, BarChart, Bar, ResponsiveContainer } from 'recharts';

interface WorkoutChartsProps {
  timeSeriesData?: {
    heartRate?: Array<{ time: number; value: number }>;
    power?: Array<{ time: number; value: number }>;
    cadence?: Array<{ time: number; value: number }>;
    elevation?: Array<{ distance: number; value: number }>;
    speed?: Array<{ time: number; value: number }>;
  };
  heartRateZones?: Array<{ zone: string; time: number; percentage: number }>;
}

const WorkoutCharts: React.FC<WorkoutChartsProps> = ({ timeSeriesData, heartRateZones }) => {
  const chartConfig = {
    value: {
      label: "Value",
      color: "hsl(var(--chart-1))",
    },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {timeSeriesData?.heartRate && (
        <Card>
          <CardHeader>
            <CardTitle>Heart Rate vs Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeSeriesData.heartRate}>
                  <XAxis dataKey="time" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {timeSeriesData?.power && (
        <Card>
          <CardHeader>
            <CardTitle>Power vs Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeSeriesData.power}>
                  <XAxis dataKey="time" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {timeSeriesData?.elevation && (
        <Card>
          <CardHeader>
            <CardTitle>Elevation vs Distance</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeSeriesData.elevation}>
                  <XAxis dataKey="distance" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {heartRateZones && (
        <Card>
          <CardHeader>
            <CardTitle>Heart Rate Zones</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={heartRateZones}>
                  <XAxis dataKey="zone" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="percentage" fill="var(--color-value)" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WorkoutCharts;
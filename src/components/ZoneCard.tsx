import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

/**
 * ⛔ ONE ZONE CARD (2026-09-26, Michael: the heart-rate card and the power card looked like two designs — a
 * monospace heart-rate card beside a power card in the app font). Both cards draw through this, in the power
 * card's look: the title, three numbers over their words, a hairline, the power card's pie when it has one,
 * then one row per zone. It prints the strings it is handed and works nothing out; each card keeps its words.
 */
/**
 * One colour per zone, easy to hard, for both cards: seven for Friel's heart-rate zones and Coggan's power
 * levels, the first five for heart-rate zones from a max heart rate. The power card's palette, moved here.
 */
export const ZONE_COLORS = [
  "#10b981", // 1 - emerald-500
  "#84cc16", // 2 - lime-500
  "#f59e0b", // 3 - amber-500
  "#ef4444", // 4 - red-500
  "#991b1b", // 5 / 5a - red-800
  "#7c2d12", // 6 / 5b - red-950
  "#581c87", // 7 / 5c - purple-900
];

export type ZoneCardStat = { value: string; label: string };
export type ZoneCardRow = {
  key: string;
  color: string;
  /** The zone's name; nothing prints when null. */
  name: string | null;
  /** The zone's range text; nothing prints when null. */
  range: string | null;
  time: string;
  share: string;
};

type ZoneCardProps = {
  title: string;
  stats: ZoneCardStat[];
  /** The power card's pie, printed between the hairline and the rows. */
  chart?: React.ReactNode;
  rows: ZoneCardRow[];
  /** Printed under the title in place of everything else. */
  empty?: string;
};

const ZoneCard: React.FC<ZoneCardProps> = ({ title, stats, chart, rows, empty }) => {
  if (empty) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">{empty}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Each number takes the width of its words and the space left sits between them: three equal thirds
            broke "with heart rate" over two lines at 375 px. On a phone too narrow for all three, words wrap. */}
        <div className="grid grid-cols-[repeat(3,auto)] justify-between gap-x-3 gap-y-4 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <Separator />

        {chart}

        <div>
          <h3 className="text-sm font-medium mb-3">Zone Details</h3>
          <div className="space-y-2">
            {rows.map((zone) => (
              <div key={zone.key} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                {/* The range sits under the name, as the share sits under the time: side by side, a 375 px phone
                    broke the top power zone's name and its range over two lines each. */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
                  <div className="min-w-0">
                    {zone.name && <div className="font-medium">{zone.name}</div>}
                    {zone.range && <div className="text-sm text-muted-foreground whitespace-nowrap">{zone.range}</div>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-medium">{zone.time}</div>
                  <div className="text-sm text-muted-foreground">{zone.share}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ZoneCard;

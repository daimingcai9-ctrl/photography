"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  getPhotosByMonth,
  getPhotosBySeason,
  getColorDistribution,
  getLocationStats,
  getCameraStats,
} from "@/lib/analytics";
import { Photo } from "@/lib/photos";
import { COLOR_CATEGORY_COLORS, ColorCategory } from "@/lib/colors";

const COLORS = [
  "#E53E3E",
  "#ED8936",
  "#ECC94B",
  "#48BB78",
  "#0BC5EA",
  "#4299E1",
  "#9F7AEA",
  "#ED64A6",
  "#A0522D",
  "#A0AEC0",
  "#1A202C",
  "#F7FAFC",
];

interface ChartProps {
  photos: Photo[];
}

export function MonthlyChart({ photos }: ChartProps) {
  const data = getPhotosByMonth(photos);

  return (
    <div className="bg-white/5 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">拍摄时间分布</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" />
          <YAxis stroke="rgba(255,255,255,0.5)" />
          <Tooltip
            contentStyle={{
              background: "rgba(0,0,0,0.8)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "8px",
            }}
            labelStyle={{ color: "#fff" }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#4299E1"
            strokeWidth={2}
            dot={{ fill: "#4299E1", r: 6 }}
            activeDot={{ r: 8 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SeasonChart({ photos }: ChartProps) {
  const data = getPhotosBySeason(photos);

  return (
    <div className="bg-white/5 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">季节分布</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis dataKey="season" stroke="rgba(255,255,255,0.5)" />
          <YAxis stroke="rgba(255,255,255,0.5)" />
          <Tooltip
            contentStyle={{
              background: "rgba(0,0,0,0.8)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "8px",
            }}
            labelStyle={{ color: "#fff" }}
          />
          <Bar dataKey="count" fill="#48BB78" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ColorChart({ photos }: ChartProps) {
  const data = getColorDistribution(photos);

  return (
    <div className="bg-white/5 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">色彩偏好</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${String(name || "")} ${(Number(percent || 0) * 100).toFixed(0)}%`}
            outerRadius={100}
            fill="#8884d8"
            dataKey="count"
          >
            {data.map((entry) => (
              <Cell
                key={entry.category}
                fill={COLOR_CATEGORY_COLORS[entry.category as ColorCategory]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "rgba(0,0,0,0.8)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "8px",
            }}
            labelStyle={{ color: "#fff" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LocationChart({ photos }: ChartProps) {
  const data = getLocationStats(photos);

  return (
    <div className="bg-white/5 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">地点统计</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis type="number" stroke="rgba(255,255,255,0.5)" />
          <YAxis dataKey="location" type="category" stroke="rgba(255,255,255,0.5)" width={80} />
          <Tooltip
            contentStyle={{
              background: "rgba(0,0,0,0.8)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "8px",
            }}
            labelStyle={{ color: "#fff" }}
          />
          <Bar dataKey="count" fill="#9F7AEA" radius={[0, 4, 4, 0]}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CameraChart({ photos }: ChartProps) {
  const data = getCameraStats(photos);

  return (
    <div className="bg-white/5 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">设备使用</h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            fill="#8884d8"
            paddingAngle={5}
            dataKey="count"
            nameKey="camera"
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "rgba(0,0,0,0.8)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "8px",
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

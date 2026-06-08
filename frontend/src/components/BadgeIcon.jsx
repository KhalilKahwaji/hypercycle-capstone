import {
  BookOpen, Wrench, Send, Zap, RefreshCw, Target, Star,
  Layers, Calendar, TrendingUp, Award, GraduationCap,
  Terminal, Code, MessageCircle,
} from "lucide-react";

const ICON_MAP = {
  BookOpen, Wrench, Send, Zap, RefreshCw, Target, Star,
  Layers, Calendar, TrendingUp, Award, GraduationCap,
  Terminal, Code, MessageCircle,
};

export default function BadgeIcon({ name, size = 24, color }) {
  const Icon = ICON_MAP[name] || Award;
  return <Icon size={size} color={color} strokeWidth={1.8} />;
}

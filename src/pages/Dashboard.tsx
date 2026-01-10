import { Link } from "react-router-dom";
import { Bot, Image, Eye, Mic, TrendingUp, Users, PlayCircle, ThumbsUp, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";

const mockData = [
  { name: "Mon", views: 4000, subs: 240 },
  { name: "Tue", views: 3000, subs: 139 },
  { name: "Wed", views: 5000, subs: 380 },
  { name: "Thu", views: 2780, subs: 208 },
  { name: "Fri", views: 6890, subs: 480 },
  { name: "Sat", views: 8390, subs: 600 },
  { name: "Sun", views: 9490, subs: 720 },
];

const tools = [
  {
    title: "TubeBot AI Agent",
    description: "Generate viral titles, hooks & full scripts with AI",
    icon: Bot,
    path: "/chat-agent",
    gradient: "from-neon-purple to-pink-500",
    glow: "neon-glow-purple",
  },
  {
    title: "Thumbnail Architect",
    description: "Create eye-catching thumbnails with AI generation",
    icon: Image,
    path: "/thumbnails",
    gradient: "from-neon-cyan to-blue-500",
    glow: "neon-glow-cyan",
  },
  {
    title: "SnapGuide Vision",
    description: "Turn screenshots into step-by-step tutorials",
    icon: Eye,
    path: "/vision-guide",
    gradient: "from-green-400 to-emerald-600",
    glow: "",
  },
  {
    title: "Voiceover Studio",
    description: "Generate professional voiceovers for your content",
    icon: Mic,
    path: "/voice",
    gradient: "from-orange-400 to-red-500",
    glow: "",
  },
];

const stats = [
  { label: "Total Views", value: "1.2M", change: "+12.5%", icon: PlayCircle },
  { label: "Subscribers", value: "45.2K", change: "+8.2%", icon: Users },
  { label: "Engagement", value: "4.8%", change: "+2.1%", icon: ThumbsUp },
  { label: "Growth Rate", value: "23%", change: "+5.4%", icon: TrendingUp },
];

export default function Dashboard() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/20 via-card to-accent/20 p-8 border border-border gradient-border">
        <div className="relative z-10">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            Hello Creator! <span className="animate-pulse">👋</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl">
            Ready to make a <span className="text-primary text-glow-purple font-semibold">viral video</span>? 
            Let's build something amazing together.
          </p>
        </div>
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/30 rounded-full blur-3xl" />
        <div className="absolute -right-20 -bottom-10 w-60 h-60 bg-accent/20 rounded-full blur-3xl" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="cyber-card border-border hover:border-primary/30 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-display font-bold text-foreground mt-1">{stat.value}</p>
                  <p className="text-xs text-green-400 mt-1">{stat.change}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart Section */}
      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="font-display text-foreground">Channel Growth</CardTitle>
          <CardDescription className="text-muted-foreground">Your performance over the last 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockData}>
                <defs>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(270, 91%, 65%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(270, 91%, 65%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSubs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(195, 100%, 50%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(195, 100%, 50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 10%, 18%)" />
                <XAxis dataKey="name" stroke="hsl(240, 5%, 55%)" fontSize={12} />
                <YAxis stroke="hsl(240, 5%, 55%)" fontSize={12} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(240, 10%, 8%)", 
                    border: "1px solid hsl(240, 10%, 18%)",
                    borderRadius: "8px",
                    color: "hsl(0, 0%, 95%)"
                  }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="views" 
                  stroke="hsl(270, 91%, 65%)" 
                  fillOpacity={1} 
                  fill="url(#colorViews)" 
                  strokeWidth={2}
                />
                <Area 
                  type="monotone" 
                  dataKey="subs" 
                  stroke="hsl(195, 100%, 50%)" 
                  fillOpacity={1} 
                  fill="url(#colorSubs)" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tools Grid */}
      <div>
        <h2 className="font-display text-xl font-semibold text-foreground mb-4">Quick Actions</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {tools.map((tool, index) => (
            <Link 
              key={tool.path} 
              to={tool.path}
              className="group"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <Card className={`cyber-card border-border hover:border-primary/50 transition-all duration-300 h-full ${tool.glow} hover:scale-[1.02]`}>
                <CardContent className="p-6 flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                    <tool.icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors">
                        {tool.title}
                      </h3>
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{tool.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Sponsor Block */}
      <Card className="cyber-card border-dashed border-border/50">
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground text-sm">
            <span className="font-display text-xs uppercase tracking-wider">Sponsored</span>
          </p>
          <p className="text-foreground mt-2">Your Ad Could Be Here</p>
          <p className="text-xs text-muted-foreground mt-1">Contact us for sponsorship opportunities</p>
        </CardContent>
      </Card>
    </div>
  );
}

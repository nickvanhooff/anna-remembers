"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { HeartPulse, Users, MessageSquare, LineChart, AlertTriangle, Settings } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ESCALATIONS } from "@/lib/mock-data"

const openCount = ESCALATIONS.filter(e => e.status === "open").length

interface NavItem {
  href: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
  badge?: number
}

const NAV: NavItem[] = [
  { href: "/patients",    label: "Patiëntbeheer",  Icon: Users },
  { href: "/chat",        label: "Chat",            Icon: MessageSquare },
  { href: "/trends",      label: "Symptoomtrends",  Icon: LineChart },
  { href: "/escalations", label: "Escalatiebeheer", Icon: AlertTriangle, badge: openCount },
]

export function DashboardSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 pb-3 pt-1 border-b border-sidebar-border mb-1">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
            <HeartPulse className="size-4" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">
            Anna<span className="text-muted-foreground font-normal"> Remembers</span>
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarMenu>
            {NAV.map(({ href, label, Icon, badge }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild isActive={pathname === href} tooltip={label}>
                  <Link href={href}>
                    <Icon />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
                {badge ? (
                  <SidebarMenuBadge
                    style={{ backgroundColor: "var(--destructive-soft-bg)", color: "var(--destructive-soft-fg)" }}
                    className="rounded-full text-[11px] font-medium"
                  >
                    {badge}
                  </SidebarMenuBadge>
                ) : null}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Instellingen" isActive={pathname === "/settings"}>
              <Link href="/settings">
                <Settings />
                <span>Instellingen</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator />
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar className="size-7 shrink-0">
            <AvatarFallback className="text-xs font-medium bg-accent text-accent-foreground">JW</AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-medium leading-tight truncate">J. de Wit</span>
            <span className="text-[11px] text-muted-foreground truncate">Cardiologie-verpleegkundige</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

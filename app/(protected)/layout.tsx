import GeofenceGate from "@/components/GeofenceGate";

export default function ProtectedLayout({ children }:{children:React.ReactNode}) {
  return <GeofenceGate>{children}</GeofenceGate>;
}

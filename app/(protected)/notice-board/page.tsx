import { Metadata } from "next";
import { NoticeBoardView } from "@/components/notice-board/NoticeBoardView";

export const metadata: Metadata = {
  title: "Employee Notice Board | Staff Broadcasts",
  description: "Official company announcements, store operations notices, shift updates & broadcasts.",
};

export default function NoticeBoardPage() {
  return <NoticeBoardView />;
}

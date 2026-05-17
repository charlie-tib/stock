import "./globals.css";

export const metadata = {
  title: "Agent4Stock",
  description: "A mobile-first stock decision assistant",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Agent4Stock",
    statusBarStyle: "default"
  }
};

export const viewport = {
  themeColor: "#1f6feb"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

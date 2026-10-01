export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-vice-bg px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

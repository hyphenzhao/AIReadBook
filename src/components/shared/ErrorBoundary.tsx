"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="max-w-md text-center">
            <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-[var(--destructive)]" />
            <h2 className="text-lg font-semibold">出错了</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {this.state.error?.message || "组件渲染出现异常"}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 inline-flex items-center gap-1 rounded-md bg-[var(--primary)] px-4 py-2 text-sm text-white hover:opacity-90"
            >
              <RotateCw className="h-4 w-4" />
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

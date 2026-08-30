import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ApiError } from "../api/client";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Input } from "../components/FormField";
import { useAuth } from "../features/auth/AuthProvider";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    try {
      await login(values);
      const state = location.state as { from?: { pathname?: string } } | null;
      void navigate(state?.from?.pathname ?? "/dashboard", { replace: true });
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : "Sign in failed. Please try again.",
      );
    }
  };

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
        Welcome back
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
        Sign in to AutoRelay
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">
        Manage your workflows and inspect every delivery attempt.
      </p>

      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        noValidate
      >
        {serverError ? <Alert>{serverError}</Alert> : null}
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register("email")}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" className="w-full" busy={isSubmitting}>
          Sign in <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-slate-400">
        New to AutoRelay?{" "}
        <Link to="/register" className="font-semibold text-emerald-300 hover:text-emerald-200">
          Create an account
        </Link>
      </p>
    </div>
  );
}

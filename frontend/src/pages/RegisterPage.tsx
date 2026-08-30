import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ApiError } from "../api/client";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Input } from "../components/FormField";
import { useAuth } from "../features/auth/AuthProvider";

const registerSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email address."),
    password: z
      .string()
      .min(12, "Use at least 12 characters.")
      .max(128, "Use no more than 128 characters."),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const { register: createAccount } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async ({ email, password }: RegisterForm) => {
    setServerError(null);
    try {
      await createAccount({ email, password });
      void navigate("/dashboard", { replace: true });
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : "Account creation failed. Please try again.",
      );
    }
  };

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
        Get started
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
        Create your account
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">
        Your workflows and execution history stay private to this account.
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
          autoComplete="new-password"
          placeholder="At least 12 characters"
          hint="Use a long, unique password."
          error={errors.password?.message}
          {...register("password")}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        <Button type="submit" className="w-full" busy={isSubmitting}>
          Create account <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-slate-400">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-emerald-300 hover:text-emerald-200">
          Sign in
        </Link>
      </p>
    </div>
  );
}

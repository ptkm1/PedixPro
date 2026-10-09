import { useRouter } from "expo-router";
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

export function useLoginScreen() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const shouldRedirectSeller =
    !loading &&
    (user?.role === "SELLER" || user?.role === "ADMIN");

  async function onSubmit() {
    setErr(null);
    setPending(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao entrar");
    } finally {
      setPending(false);
    }
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    err,
    pending,
    shouldRedirectSeller,
    onSubmit,
  };
}

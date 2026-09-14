import { SafeScreen } from "@/components/layout";
import { Redirect, useRouter } from "expo-router";
import { Pressable, Text } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { useOrgAccessBlockStyles } from "@/styles/org-access-block.styles";

export default function OrgAccessBlockScreen() {
  const router = useRouter();
  const { orgAccessBlocked, clearOrgAccessBlocked } = useAuth();
  const styles = useOrgAccessBlockStyles();

  if (!orgAccessBlocked) {
    return <Redirect href="/login" />;
  }

  return (
    <SafeScreen style={{ padding: 24, justifyContent: "center", gap: 16 }}>
      <Text style={styles.title}>Acesso indisponível</Text>
      <Text style={styles.body}>{orgAccessBlocked.message}</Text>
      <Pressable
        style={styles.btn}
        onPress={() => {
          clearOrgAccessBlocked();
          router.replace("/login");
        }}
      >
        <Text style={styles.btnText}>Voltar ao login</Text>
      </Pressable>
    </SafeScreen>
  );
}

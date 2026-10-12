import { getGoogleMapsApiKey } from "@/lib/maps/google-maps-config";
import { MiniMapThumbFallback } from "./MiniMapThumbFallback";
import { MiniMapThumbStatic } from "./MiniMapThumbStatic";
import type { MiniMapThumbProps } from "./MiniMapThumb.types";

/** Web: Static Maps se houver chave; senão placeholder. */
export function MiniMapThumb(props: MiniMapThumbProps) {
  if (getGoogleMapsApiKey()) {
    return <MiniMapThumbStatic {...props} />;
  }
  return <MiniMapThumbFallback style={props.style} size={props.size} />;
}

// Module augmentation for lucide-react-native@0.475.0.
// `color` is accepted at runtime but omitted from LucideProps because
// react-native-svg (peer dep) is not co-located with lucide in this npm
// workspace, so TypeScript cannot resolve SvgProps to find ColorValue.
// The export {} makes this a module so the declare module below is treated
// as an augmentation, not a replacement.
export {};

declare module 'lucide-react-native' {
  interface LucideProps {
    color?: string;
    strokeWidth?: string | number;
  }
}

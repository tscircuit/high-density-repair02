import type { ReactDecorator } from "react-cosmos-core"

const decorator: ReactDecorator = ({ children }) => {
  return <div style={{ padding: 16 }}>{children}</div>
}

export default decorator

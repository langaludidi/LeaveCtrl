import { ImageResponse } from "next/og";

export const alt = "LeaveCtrl — Leave & Workforce Availability";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

function MatrixCell({
  centre = false,
  partial = false,
}: {
  centre?: boolean;
  partial?: boolean;
}) {
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        border: centre ? "2px solid #008080" : "2px solid #B8C4C7",
        background: centre ? "#008080" : "#FFFFFF",
        position: "relative",
        overflow: "hidden",
        display: "flex",
      }}
    >
      {partial ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            width: 14,
            height: 30,
            background: "#008080",
            display: "flex",
          }}
        />
      ) : null}
    </div>
  );
}

function MatrixMark() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <MatrixCell /><MatrixCell /><MatrixCell />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <MatrixCell /><MatrixCell centre /><MatrixCell />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <MatrixCell /><MatrixCell /><MatrixCell partial />
      </div>
    </div>
  );
}

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#F6F9F9",
          color: "#17212B",
          padding: "72px 82px",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: "1px solid #DCE5E5",
            borderRadius: 34,
            background: "#FFFFFF",
            padding: "58px 64px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <MatrixMark />
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                fontSize: 64,
                fontWeight: 800,
                letterSpacing: "-3px",
              }}
            >
              <span style={{ color: "#17212B" }}>Leave</span>
              <span style={{ color: "#008080" }}>Ctrl</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
            <div
              style={{
                fontSize: 22,
                letterSpacing: "3px",
                textTransform: "uppercase",
                color: "#66778A",
                fontWeight: 700,
              }}
            >
              Leave & workforce availability
            </div>
            <div
              style={{
                fontSize: 54,
                lineHeight: 1.08,
                letterSpacing: "-2.2px",
                fontWeight: 760,
                maxWidth: 900,
              }}
            >
              Simple leave control for modern teams.
            </div>
            <div
              style={{
                fontSize: 24,
                lineHeight: 1.45,
                color: "#66778A",
                maxWidth: 920,
              }}
            >
              Leave, availability, approvals and TOIL in one calm operational workspace.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 19,
              color: "#66778A",
            }}
          >
            <span>leavectrl.co.za</span>
            <span style={{ color: "#008080", fontWeight: 700 }}>Workforce clarity, without the clutter.</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}

import { NextResponse } from "next/server";
import { generateTemplateWorkbook } from "@/lib/import/template";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const buffer = generateTemplateWorkbook();

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="smart_roster_template.xlsx"',
      },
    });
  } catch (error: any) {
    console.error("Template generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate template", details: error.message },
      { status: 500 }
    );
  }
}

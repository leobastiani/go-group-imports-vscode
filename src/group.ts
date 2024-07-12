import { Range, WorkspaceEdit, window, workspace } from "vscode";
import { getImports, getImportsRange, resolveRootPackage } from "./utils";

type Strategy = {
  priority: number;
  includes: string;
};

export const goGroupImports = async () => {
  const strategy = getStrategy();
  if (!strategy || strategy.length === 0) {
    return;
  }
  const excludeFn = getExcludeFn();
  if (excludeFn(window.activeTextEditor.document.fileName)) {
    return;
  }

  const { document } = window.activeTextEditor;
  const documentText = document.getText();

  if (document.languageId !== "go") return;

  const rootPkg = await resolveRootPackage();
  if (rootPkg === "") {
    window.showErrorMessage(
      "Failed to resolve root project directory. No GOPATH variable or go.mod file found."
    );
    return;
  }
  // TODO show error

  const imports = getImports(documentText);

  if (!imports.length) return;

  const groupedList = group(imports, rootPkg, strategy);
  const importsRange = getImportsRange(documentText);

  const edit = new WorkspaceEdit();
  const range = new Range(
    importsRange.start,
    0,
    importsRange.end - 1,
    Number.MAX_VALUE
  );
  const newImports = importGroupsToString(groupedList);
  edit.replace(document.uri, range, newImports);
  workspace.applyEdit(edit).then(document.save);
};

const getStrategy = () => {
  return workspace
    .getConfiguration("groupImports")
    .get("strategy") as Strategy[];
};

const getExcludeFn = () => {
  const exclude = workspace
    .getConfiguration("groupImports")
    .get("exclude") as string[];
  const fns = exclude.map((e) => {
    if (e.startsWith("/") && e.endsWith("/")) {
      const regex = new RegExp(e.slice(1, e.length - 1), "g");
      return (str: string) => regex.test(str);
    }
    return (str: string) => e.includes(str);
  });
  return (str: string) => fns.some((fn) => !fn(str));
};

export const group = (
  imports: string[],
  rootPkg,
  strategy: Strategy[]
): string[][] => {
  const ret: string[][] = [];
  for (const i of imports) {
    let inside = i.match(/(["'])(?:(?=(\\?))\2.)*?\1/)?.[0];
    if (!inside) {
      continue;
    }
    inside = inside.slice(1, inside.length - 1);
    for (const s of strategy) {
      let includes: string | RegExp = s.includes;
      if (includes.startsWith("/") && includes.endsWith("/")) {
        includes = new RegExp(includes.slice(1, includes.length - 1));
      }
      if (inside.match(includes)) {
        ret[s.priority] = ret[s.priority] ?? [];
        ret[s.priority].push(i);
        break;
      }
    }
  }
  return ret.filter(Boolean);
};

const importGroupsToString = (importGroups: string[][]): string =>
  importGroups.map((i) => i.join("\n")).join("\n\n");

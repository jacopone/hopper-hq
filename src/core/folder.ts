/**
 * Floors by project folder (HOPPER_HQ_FLOORS=folder): the floor is the folder a session works in, the way the terminal's
 * workspaces group sessions, read from its working directory. Pure string work on '/'-separated absolute paths.
 */

export interface FolderRules {
  /** The home directory: the folders right under it are floors. */
  home: string;
  /** Folders that hold projects rather than being one: the folders right under each are floors. */
  containers: readonly string[];
}

/** A session's folder floor: its key, the folder's path; and its name. */
export interface FolderFloor {
  key: string;
  name: string;
}

/** The key of the floor of every session outside the home. A path is absolute, so no folder has it. */
export const OTHER_FOLDER = 'other';

const trim = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, '') : p);

/** The path's segments under `dir`, or null when it is not `dir` or under it: whole segments only. */
function under(path: string, dir: string): string[] | null {
  if (path === dir) return [];
  return path.startsWith(dir + '/') ? path.slice(dir.length + 1).split('/').filter(Boolean) : null;
}

/**
 * The floor of a session working in `cwd`: under the deepest container folder that holds it, the folder right under that
 * container (the container itself in it); else under the home, the folder right under the home (the home itself in it,
 * named '~'); else the floor of everything outside the home.
 */
export function folderFloorOf(cwd: string, rules: FolderRules): FolderFloor {
  const path = trim(cwd);
  const home = trim(rules.home);
  const containers = rules.containers.map(trim).sort((a, b) => b.length - a.length);
  for (const c of containers) {
    const rest = under(path, c);
    if (rest === null) continue;
    const key = rest.length === 0 ? c : `${c}/${rest[0]}`;
    return { key, name: key.slice(key.lastIndexOf('/') + 1) || key };
  }
  const rest = under(path, home);
  if (rest === null) return { key: OTHER_FOLDER, name: 'other' };
  if (rest.length === 0) return { key: home, name: '~' };
  return { key: `${home}/${rest[0]}`, name: rest[0]! };
}

# Command parser

`@gitdojo/command-parser` turns one line of terminal input into a `ParsedCommand` and routes it to
the Git engine. It is the only way input reaches Git: the terminal has no command logic of its
own, and nothing ever reaches an operating-system shell.

```text
"git reset --hard HEAD~1"
   ↓ tokenize      ["git", "reset", "--hard", "HEAD~1"]
   ↓ parseCommand  { program: "git", command: "reset", flags: { hard: true }, args: ["HEAD~1"] }
   ↓ executeCommand → GitEngine.reset({ mode: "hard", commit: "HEAD~1" })
   ↓ CommandExecutionResult { ok, output, errorCode? }
```

## Tokenizer

`tokenize` implements a small, predictable subset of shell quoting: whitespace separates words,
single quotes are literal, double quotes allow `\"`, a backslash escapes the next character, and
adjacent quoted parts join (`-m"Initial commit"`). There is **no** expansion of any kind: no
variables, globs, `~`, command substitution, pipes or redirection. An unterminated quote is an
error, not a prompt for more input.

## Parser

`parseCommand(raw)` never throws. It returns `{ ok: true, command }` or `{ ok: false, error }`
with a Git-like message and a `ParseErrorCode`:

| Code                      | Example               | Message                                                 |
| ------------------------- | --------------------- | ------------------------------------------------------- |
| `UNSUPPORTED_PROGRAM`     | `ls`                  | `ls: command not found` (+ a pointer to `help`)         |
| `MISSING_GIT_COMMAND`     | `git`                 | The list of supported commands                          |
| `UNSUPPORTED_GIT_COMMAND` | `git frob`            | `not available in GitDojo yet` / `is not a git command` |
| `UNKNOWN_FLAG`            | `git status --short`  | `error: unknown option '--short'` + usage               |
| `MISSING_FLAG_VALUE`      | `git commit -m`       | `error: switch 'm' requires a value`                    |
| `UNEXPECTED_ARGUMENT`     | `git branch a b c`    | `error: unexpected argument 'c'` + usage                |
| `MALFORMED_QUOTES`        | `git commit -m "oops` | `error: unterminated double quote`                      |

Commands are declared in `GIT_COMMAND_SPECS` (`src/commands.ts`): name, summary, usage, flags and
how many positional arguments are allowed. Flags support:

- long (`--staged`) and short (`-S`) names, with aliases (`--cached` = `--staged`);
- values attached (`-mmsg`, `--source=HEAD`) or as the next word (`-m msg`);
- bundled short flags (`-rf` = `-r -f`); only the last of a bundle may take a value (`-um msg`);
- repeated values joined by a separator (`-m a -m b` → two paragraphs);
- a count written as a bare number, for a spec with a `countFlag` (`git log -3` is `-n 3`).

`-h` or `--help` anywhere among the options, and `git help <command>`, parse as
`{ command, help: true }` with no arguments, whatever else is on the line. The router answers with
the command's usage, summary and options, and runs nothing.

`--` ends options. Everything after it is an argument, and `ParsedCommand.pathsFrom` records
where it appeared, so commands can tell paths from revisions (`git reset HEAD~1 -- README.md`).

`help` and `clear` are terminal built-ins. They are parsed and routed like everything else.
(`git help` is Git's own help: it lists the Git commands, like `git` alone.)

## Terminal completion

Press `Tab` to complete a supported Git command or flag, or to complete a branch, commit, tag,
remote, stash or working-tree path from the current virtual repository. Ambiguous matches extend to
their shared prefix first; press `Tab` again to list the remaining choices. The completion source is
the same command catalog used by the parser and the current repository snapshot, so suggestions
never invoke a host shell or read files from the learner's machine. `Ctrl+W`, `Ctrl+U` and `Ctrl+K`
delete the previous word, text before the cursor and text after the cursor, respectively.

## Router

`executeCommand(parsed, { git })` maps each supported command to `GitEngine` calls
(`src/router/router.ts`). The router interprets flag combinations (`git stash pop` vs
`git stash list`, `--continue` / `--abort` / `--skip`, `git checkout <commit>` detaching HEAD)
but contains no Git logic of its own. It never rejects: unexpected errors become
`fatal: something went wrong while running that command.` with error code `INTERNAL`, and the
real error goes to the developer console only.

`runCommandLine(raw, context)` parses and executes in one step; that is what the terminal and
lesson setup `commands` use.

Every result for a supported Git command carries `gitCommand` (`git commit -m x` → `commit`), set
whether the command succeeded or not, including lines that name a supported command but fail to
parse (`git branch a b c`). `help`, `clear`, `-h` / `--help`, other programs and unsupported Git
commands have none. Local progress counts command usage from this field, so it reflects what actually ran
rather than a pattern match on the typed text.

## Supported commands

`init`, `status`, `add`, `commit` (including `-a`, `--amend`, `--no-edit` and `--reset-author`),
`log` (with `--graph`, `-n` / `-<number>`, `--stat` and `-p`), `show`, `mv`, `branch` (with `-r`,
`-a`, `-v`, and `-m` / `-M` to rename), `switch`, `checkout`, `merge`, `diff`, `restore`,
`rm`, `reset`, `revert`, `stash`, `cherry-pick`, `reflog`, `rebase` (with `-i`), `tag`, `config`,
`remote`, `clone`, `fetch`, `pull` and `push`. `help` in the terminal lists them with their usage;
see [git-engine.md](./git-engine.md) for behaviour, including what the simulated remotes can and
cannot do. A real command listed in `PLANNED_GIT_COMMANDS` (none at the moment) gets a "not
available in GitDojo yet" message instead of "not a git command".

See the [hands-on command coverage matrix](./command-coverage.md) for curriculum-to-terminal
coverage and explicit simulation limits.

`git checkout` keeps working the way older tutorials use it. With `-b` it creates a branch; with
paths after `--` it restores files (`git checkout -- README.md` from the staging area,
`git checkout HEAD~1 -- README.md` from a commit, staged too); several words without `--` are
paths, after a commit if the first one names one. A single word is a branch, then a commit
(detaching HEAD), then a file. `git diff` hands the words before `--` to the engine, which tells
commits (`HEAD~1`, `main feature`, `main..feature`, `main...feature`) from paths, as Git does.
`git log -n` refuses a count that is not a number, and `git branch -m` / `-M` renames the current
branch (`<new>`) or another one (`<old> <new>`).

The router's `remote` handler lists remotes (`git remote`, `git remote -v`) and routes `add`,
`remove` (`rm`), `rename`, `set-url` and `get-url` to `git.remote()`, checking each one's number
of arguments. `config` picks its action from `--list` / `--get` / `--unset`, or from the number
of arguments (a name reads, a name and a value sets), and its file from `--global` / `--local`.
`push` maps `--force-with-lease` and `-f` / `--force` (one or the other), `-d` / `--delete` and
`--tags`. `git pull`
maps `--rebase` / `-r`, `--no-rebase` and `--ff-only` to the engine's pull modes and refuses
more than one; `git tag` routes `-d` to deletion, `-l` / `-n` (or no name) to listing, and
anything else to creation.

## Adding a command

1. Add a spec to `GIT_COMMAND_SPECS` and remove the name from `PLANNED_GIT_COMMANDS`.
2. Implement it in the Git engine (see [git-engine.md](./git-engine.md#adding-a-git-command)).
3. Add a handler to `gitHandlers` in the router; the compiler requires one per spec.
4. Add parser tests (`src/parser.test.ts`) and router tests (`src/router/router.test.ts`).

Challenges that list the command in `requires` unlock automatically.

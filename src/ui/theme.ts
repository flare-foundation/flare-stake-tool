import { createTheme } from "@mui/material";

export const MUITheme = createTheme({
    components: {
        MuiButton: {
            defaultProps: {
                variant: "contained",
            },
            styleOverrides: {
                root: {
                    margin: "3px",
                    marginBottom: "10px"
                }
            }
        },
        MuiLink: {
            defaultProps: {
                underline: "none"
            }
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    margin: "3px",
                    marginBottom: "10px"
                }
            }
        },
        MuiTypography: {
            styleOverrides: {
                root: {
                    margin: "3px",
                    marginBottom: "15px"
                }
            }
        },
        MuiCheckbox: {
            styleOverrides: {
                root: {
                    margin: "3px",
                    marginBottom: "15px"
                }
            }
        },
        MuiFormControlLabel: {
            styleOverrides: {
                root: {
                    margin: "0px",
                    marginBottom: "-10px"
                }
            }
        },
    },
});